import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, isAbsolute } from 'node:path'
import { parse } from 'yaml'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { provisionGodotPresets } from '../packages/dsh-godot-stack/index.js'
import { sanitizeTopic } from '../packages/dsh-godot-stack/memory-root.mjs'
import { cliHome, tokenCandidatePaths } from '../packages/dsh-godot-stack/data-home.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('factory expert presets', () => {
  it('copies lite and the three experts into a fresh home', async () => {
    const home = await mkdtemp(join(tmpdir(), 'godot-presets-'))
    roots.push(home)
    await provisionGodotPresets(home)
    const lite = await readFile(join(home, '.agent-presets/godot-codely-lite/agent.cordis.yml'), 'utf8')
    expect(lite).toContain('You are a helpful Godot coding agent')
    expect(lite).toContain('methodology-2.0.md')
    expect(lite).not.toContain('先五人团')
    const routing = await readFile(join(home, '.agent-presets/godot-codely-lite/docs/team-routing.md'), 'utf8')
    expect(routing).toContain('godot-scene-expert')
    expect(routing).toContain('godot-shader-expert')
    expect(routing).toContain('godot-gdscript-expert')
    for (const name of ['godot-scene-expert', 'godot-shader-expert', 'godot-gdscript-expert']) {
      const agent = await readFile(join(home, '.agent-presets', name, 'agent.cordis.yml'), 'utf8')
      expect(agent, name).toContain('工具与边界')
      expect(agent, name).toContain('失败出口')
      expect(await readFile(join(home, '.agent-presets', name, 'preset.yml'), 'utf8')).toContain('name:')
    }
  })
})

describe('preset docs runtime paths', () => {
  it('reads docs from an unrelated project and rebinds a relocated Profile', async () => {
    const root = await mkdtemp(join(tmpdir(), 'godot-persona-docs-'))
    roots.push(root)
    const project = join(root, 'unrelated-game')
    await mkdir(project)
    for (const label of ['profile with spaces', 'relocated-profile']) {
      const home = join(root, label)
      await provisionGodotPresets(home)
      await provisionGodotPresets(home)
      const preset = join(home, '.agent-presets/godot-codely-lite')
      const yaml = await readFile(join(preset, 'agent.cordis.yml'), 'utf8')
      const rows = parse(yaml, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] })
      const prefix = rows.find(row => row.name === '@deepseek-ai/dsh-persona').config.prefix
      const match = prefix.match(/^On-demand docs root \(absolute, not project cwd\): (.+)$/m)
      expect(match).not.toBeNull()
      const docsRoot = JSON.parse(match[1])
      expect(isAbsolute(docsRoot)).toBe(true)
      expect(docsRoot).toBe(join(preset, 'docs'))
      expect(prefix).not.toContain('__GODOT_CODELY_DOCS_ROOT__')
      expect(prefix).not.toContain('# 方法论 2.0')
      expect((await readFile(join(preset, 'SYSTEM_PROMPT.md'), 'utf8')).replaceAll('\r\n', '\n').trimEnd()).toBe(prefix)
      const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', `
        import { join } from 'node:path'
        import { Context } from ${JSON.stringify(import.meta.resolve('@deepseek-ai/cordis'))}
        import { SystemPrompt } from ${JSON.stringify(import.meta.resolve('@deepseek-ai/dsh-system-prompt'))}
        import { ToolRuntime } from ${JSON.stringify(import.meta.resolve('@deepseek-ai/dsh-tools'))}
        import { LocalFileSystem } from ${JSON.stringify(import.meta.resolve('@deepseek-ai/dsh-fs-local'))}
        import * as fsTools from ${JSON.stringify(import.meta.resolve('@deepseek-ai/dsh-tool-fs'))}
        const root = ${JSON.stringify(docsRoot)}
        const names = ['methodology-2.0.md', 'loop-examples.md', 'zfoo-framework.md', 'team-routing.md']
        const ctx = new Context()
        const forks = []
        try {
          for (const [plugin, config] of [[SystemPrompt], [ToolRuntime], [LocalFileSystem, { cwd: process.cwd() }], [fsTools]]) {
            const fork = ctx.plugin(plugin, config)
            forks.push(fork)
            await fork
          }
          const docs = await Promise.all(names.map(name => ctx.tools.execute({
            name: 'read', arguments: { file_path: join(root, name) },
            callId: name, signal: new AbortController().signal
          })))
          process.stdout.write(JSON.stringify(docs.map(doc => !doc.isError && doc.content.some(item => item.type === 'text' && item.text.includes('# ')))))
        } finally { for (const fork of forks.reverse()) await fork.dispose() }
      `], { cwd: project })
      expect(JSON.parse(stdout)).toEqual([true, true, true, true])
    }
  })
})

describe('shared memory root', () => {
  it('ignores the desktop harness DSH_HOME and adopts missing legacy topics', async () => {
    const home = await mkdtemp(join(tmpdir(), 'godot-memory-root-'))
    roots.push(home)
    const desktop = join(home, 'harness')
    const user = join(home, 'user')
    await mkdir(join(desktop, 'memories'), { recursive: true })
    await mkdir(join(user, '.godot-codely/memories'), { recursive: true })
    await writeFile(join(desktop, 'memories/only_legacy.md'), 'legacy-fact', 'utf8')
    await writeFile(join(desktop, 'memories/from_desktop.md'), 'desktop-fact', 'utf8')
    await writeFile(join(user, '.godot-codely/memories/from_desktop.md'), 'keep-shared', 'utf8')
    // Worker-local process.env changes do not update os.homedir()'s native
    // environment in a threads pool. Test startup in a real isolated process.
    const moduleUrl = new URL('../packages/dsh-godot-stack/memory-root.mjs', import.meta.url).href
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', `
      import { memoryRoot, adoptLegacyMemories } from ${JSON.stringify(moduleUrl)}
      process.stdout.write(JSON.stringify({ root: memoryRoot(), adopted: adoptLegacyMemories() }))
    `], { env: { ...process.env, HOME: user, USERPROFILE: user, DSH_HOME: desktop, GODOT_CODELY_MEMORY_DIR: '' } })
    const result = JSON.parse(stdout)
    expect(result.root).toBe(join(user, '.godot-codely', 'memories'))
    expect(result.adopted).toBe(join(user, '.godot-codely', 'memories'))
    expect(await readFile(join(user, '.godot-codely/memories/only_legacy.md'), 'utf8')).toBe('legacy-fact')
    expect(await readFile(join(user, '.godot-codely/memories/from_desktop.md'), 'utf8')).toBe('keep-shared')
    expect(sanitizeTopic('../outside')).toBeNull()
    expect(sanitizeTopic('topic_a')).toBe('topic_a')
    expect(cliHome({ DSH_HOME: '' }, user)).toBe(join(user, '.godot-codely'))
    const tokens = tokenCandidatePaths({ APPDATA: join(user, 'AppData', 'Roaming') }, user)
    expect(tokens.some((candidate) => candidate.includes(`${join('godot-codely', 'harness')}`))).toBe(true)
    expect(tokens.some((candidate) => candidate.includes('dsh-desktop'))).toBe(false)
    expect(tokens.some((candidate) => candidate.endsWith(join('.dsh', 'godot-codely-launch-token')))).toBe(false)
  })
})
