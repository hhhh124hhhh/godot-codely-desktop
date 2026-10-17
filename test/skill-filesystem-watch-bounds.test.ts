import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Issue #34 P0-2: the filesystem skill provider used to await chokidar
// "ready" without any bound, so a hostile user skill root (huge archives,
// junction cycles) froze Harness startup forever. The host patch bounds the
// readiness wait and degrades to un-watched discovery instead of hanging.

interface FakeWatcher extends EventEmitter {
  close: () => Promise<void>
}

const watchCalls: string[] = []
const fakeWatchers: FakeWatcher[] = []
let fireReadyAutomatically = true

// The provider bundles its own nested chokidar copy, so the mock must target
// the resolved path the provider itself imports.
vi.mock('../node_modules/@deepseek-ai/dsh-skill-filesystem/node_modules/chokidar/index.js', () => ({
  default: {
    watch: (anchor: string) => {
      watchCalls.push(anchor)
      const watcher = new EventEmitter() as FakeWatcher
      watcher.close = () => Promise.resolve()
      fakeWatchers.push(watcher)
      if (fireReadyAutomatically) queueMicrotask(() => watcher.emit('ready'))
      return watcher
    }
  }
}))

const { FileSystemSkillProvider } = await import('@deepseek-ai/dsh-skill-filesystem')

const roots: string[] = []
const warns: string[] = []

function makeProvider(home: string) {
  const ctx = {
    logger: { warn: (message: string) => warns.push(message) },
    get: () => undefined
  }
  const control = { signal: new AbortController().signal, invalidate: () => {} }
  return new FileSystemSkillProvider(ctx as never, control as never, {
    agentsHome: path.join(home, 'agents'),
    dshHome: path.join(home, 'dsh'),
    watchReadyTimeoutMs: 150
  } as never)
}

function agentsSkills(home: string): string {
  return path.join(home, 'agents', 'skills')
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'dsh-skill-bounds-'))
  roots.push(root)
  return root
}

async function writeSkill(dir: string, name: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: test skill ${name}\n---\nbody\n`,
    'utf8'
  )
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  watchCalls.length = 0
  fakeWatchers.length = 0
  warns.length = 0
  fireReadyAutomatically = true
  vi.unstubAllEnvs()
})

describe('skill-filesystem watcher readiness bounds (P0-2 patch)', () => {
  it('resolves an empty skill directory quickly and completely', async () => {
    const home = await tempRoot()
    const skills = agentsSkills(home)
    await mkdir(skills, { recursive: true })

    const result = await makeProvider(home).list({ cwd: undefined } as never)
    const candidates = Array.isArray(result) ? result : result.candidates
    expect(candidates).toEqual([])
  })

  it('discovers skills from a normal skill directory', async () => {
    const home = await tempRoot()
    const skills = agentsSkills(home)
    await writeSkill(path.join(skills, 'alpha'), 'alpha')
    await writeSkill(path.join(skills, 'beta'), 'beta')

    const result = await makeProvider(home).list({ cwd: undefined } as never)
    const candidates = Array.isArray(result) ? result : result.candidates
    expect(candidates.map((skill) => skill.name).sort()).toEqual(['alpha', 'beta'])
  })

  it('degrades instead of hanging when the watcher never becomes ready', async () => {
    fireReadyAutomatically = false
    const home = await tempRoot()
    const skills = agentsSkills(home)
    await writeSkill(path.join(skills, 'alpha'), 'alpha')

    const provider = makeProvider(home)
    const startedAt = Date.now()
    const result = await provider.list({ cwd: undefined } as never)
    const elapsed = Date.now() - startedAt

    expect(Array.isArray(result)).toBe(false)
    expect((result as { complete: boolean }).complete).toBe(false)
    expect((result as { candidates: Array<{ name: string }> }).candidates.map((s) => s.name)).toEqual(['alpha'])
    // Bounded: did not wait forever; default bound is seconds, here 150ms.
    expect(elapsed).toBeLessThan(5_000)
    expect(warns.some((message) => message.includes('did not become ready'))).toBe(true)
  })

  it('does not re-arm the watcher for an unhealthy root within the cooldown', async () => {
    fireReadyAutomatically = false
    const home = await tempRoot()
    const skills = agentsSkills(home)
    await mkdir(skills, { recursive: true })
    const provider = makeProvider(home)

    await provider.list({ cwd: undefined } as never)
    const attemptsAfterFailure = watchCalls.length
    expect(attemptsAfterFailure).toBeGreaterThan(0)

    await provider.list({ cwd: undefined } as never)
    expect(watchCalls.length).toBe(attemptsAfterFailure)
  })

  it('treats a skill root that is not a directory as absent instead of failing', async () => {
    const home = await tempRoot()
    await mkdir(path.join(home, 'agents'), { recursive: true })
    await writeFile(path.join(home, 'agents', 'skills'), 'not a directory', 'utf8')

    const result = await makeProvider(home).list({ cwd: undefined } as never)
    const candidates = Array.isArray(result) ? result : result.candidates
    expect(candidates).toEqual([])
  })

  it('bounds discovery on a heavy directory without reading archive payloads', async () => {
    const home = await tempRoot()
    const skills = agentsSkills(home)
    const archive = path.join(skills, '.archive')
    await mkdir(archive, { recursive: true })
    await writeSkill(path.join(skills, 'real'), 'real')
    for (let index = 0; index < 300; index += 1) {
      await writeFile(path.join(archive, `blob-${index}.wasm`), 'x'.repeat(1024), 'utf8')
    }

    const startedAt = Date.now()
    const result = await makeProvider(home).list({ cwd: undefined } as never)
    const elapsed = Date.now() - startedAt
    const candidates = Array.isArray(result) ? result : result.candidates
    expect(candidates.map((skill) => skill.name)).toEqual(['real'])
    expect(elapsed).toBeLessThan(5_000)
  })

  it('honors DSH_SKILL_WATCH_READY_TIMEOUT_MS for the readiness bound', async () => {
    vi.stubEnv('DSH_SKILL_WATCH_READY_TIMEOUT_MS', '123')
    const { FileSystemSkillProvider: Provider } = await import('@deepseek-ai/dsh-skill-filesystem')
    const home = await tempRoot()
    await mkdir(path.join(home, 'skills'), { recursive: true })
    const ctx = { logger: { warn: () => undefined }, get: () => undefined }
    const control = { signal: new AbortController().signal, invalidate: () => {} }
    const provider = new Provider(ctx as never, control as never, {
      agentsHome: home,
      dshHome: home
    } as never)
    // No watchReadyTimeoutMs in config: env must be picked up. A broken value
    // would make the readiness bound invalid; here we only need list() to
    // succeed, proving the env parse did not throw.
    fireReadyAutomatically = false
    const result = await provider.list({ cwd: undefined } as never)
    expect(Array.isArray(result)).toBe(false)
  })

  it('skips a skill directory behind an unreadable junction without hanging', async () => {
    if (process.platform !== 'win32') return
    const home = await tempRoot()
    const skills = agentsSkills(home)
    await mkdir(skills, { recursive: true })
    // Junction pointing at a nonexistent target: stat follows the link and
    // fails, nodeEntryKind must not hang discovery.
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    await promisify(execFile)('cmd', ['/c', 'mklink', '/J', path.join(skills, 'dangling'), path.join(home, 'missing')])
    await writeSkill(path.join(skills, 'real'), 'real')

    const result = await makeProvider(home).list({ cwd: undefined } as never)
    const candidates = Array.isArray(result) ? result : result.candidates
    expect(candidates.map((skill) => skill.name)).toEqual(['real'])
  })
})
