import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtemp, readFile, realpath, writeFile, mkdir, rm, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'

const processFixture = vi.hoisted(() => ({ version: '4.7.1.stable.official', children: [] as unknown[], launches: [] as Array<{ file: string; args: string[]; options: unknown }>, fail: false }))
vi.mock('node:child_process', () => ({
  execFile: (_file: string, _args: string[], _options: unknown, callback: (error: Error | null, result: unknown) => void) => callback(processFixture.fail ? Error('cannot execute') : null, { stdout: processFixture.version, stderr: '' }),
  spawn: (file: string, args: string[], options: unknown) => {
    processFixture.launches.push({ file, args, options })
    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null, signalCode: null as string | null,
      stdout: new PassThrough(), stderr: new PassThrough(),
      unref: vi.fn(),
      kill: vi.fn(() => { queueMicrotask(() => { child.signalCode = 'SIGTERM'; child.emit('exit', null) }); return true })
    })
    processFixture.children.push(child)
    queueMicrotask(() => child.emit('spawn'))
    return child
  }
}))
import { GodotEngineService } from '../src/main/godot-engine'
import { handleGodotEngineRequest } from '../src/main/godot-engine-ipc'
import { createGodotEngineBridge } from '../src/preload/godot-engine'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  processFixture.children = []; processFixture.launches = []; processFixture.version = '4.7.1.stable.official'; processFixture.fail = false
})
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'godot-engine-')))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const project = { path: join(root, 'game'), mainScene: 'res://main.tscn' }
  await mkdir(project.path)
  await writeFile(join(project.path, 'project.godot'), 'config_version=5\n')
  const executable = join(root, 'godot.exe')
  await writeFile(executable, 'fixture executable; process calls are simulated')
  const file = join(root, 'settings', 'godot-path.txt')
  const service = new GodotEngineService(file, '')
  cleanups.push(() => service.dispose())
  return { service, project, executable, file }
}
function child(index = 0) {
  const value = processFixture.children[index]
  if (!(value instanceof EventEmitter)) throw Error('Missing child')
  return value as EventEmitter & { stdout: PassThrough; stderr: PassThrough; kill: ReturnType<typeof vi.fn>; exitCode: number | null }
}

it('persists a validated engine atomically, restores it, and preserves the old selection on failure', async () => {
  const f = await fixture()
  await f.service.configure(f.executable)
  expect((await readFile(f.file, 'utf8')).trim()).toBe(f.executable)
  expect((await new GodotEngineService(f.file, '').snapshot()).path).toBe(f.executable)
  processFixture.version = '4.0.stable'
  await expect(f.service.configure(f.executable)).rejects.toThrow('ENGINE_VERSION')
  expect((await readFile(f.file, 'utf8')).trim()).toBe(f.executable)
  const externallyChosen = join(f.project.path, 'another-godot.exe')
  await writeFile(f.file, externallyChosen + '\n')
  expect((await f.service.snapshot()).path).toBe(externallyChosen)
  expect((await f.service.snapshot()).version).toBe(null)
})

it('owns a single game per project, keeps bounded output, and stops only that project', async () => {
  const f = await fixture()
  await f.service.configure(f.executable)
  await f.service.launch(f.project, 'run')
  expect(processFixture.launches[0]).toEqual({ file: f.executable, args: ['--path', f.project.path], options: expect.objectContaining({ shell: false, windowsHide: true }) })
  await expect(f.service.launch(f.project, 'run')).rejects.toThrow('ENGINE_ALREADY_RUNNING')
  child().stdout.write('x'.repeat(40000))
  child().stderr.write('meaningful diagnostic')
  const snapshot = await f.service.snapshot(f.project)
  expect(snapshot.running).toBe(true)
  expect(snapshot.truncated).toBe(true)
  expect(snapshot.logs.length).toBeLessThanOrEqual(32768)
  expect(snapshot.logs).toContain('meaningful diagnostic')
  await f.service.stop({ path: dirnameOf(f.project.path), mainScene: '' })
  expect(child().kill).not.toHaveBeenCalled()
  await rename(f.project.path, f.project.path + '-moved')
  await f.service.stop(f.project)
  expect(child().kill).toHaveBeenCalledOnce()
  expect((await f.service.snapshot(f.project)).running).toBe(false)
  expect((await f.service.snapshot(f.project)).logs).toContain('meaningful diagnostic')
})
function dirnameOf(path: string): string { return join(path, '..') }

it('retains editors on quit, stops games, and rejects starts after disposal', async () => {
  const f = await fixture()
  await f.service.configure(f.executable)
  await f.service.launch(f.project, 'open')
  await f.service.launch(f.project, 'run')
  await f.service.dispose()
  expect(child(0).kill).not.toHaveBeenCalled()
  expect(child(1).kill).toHaveBeenCalledOnce()
  await expect(f.service.launch(f.project, 'run')).rejects.toThrow('ENGINE_BUSY')
})

it('does not let old process output contaminate a later run, and blocks a missing main scene', async () => {
  const f = await fixture()
  await f.service.configure(f.executable)
  await expect(f.service.launch({ ...f.project, mainScene: '' }, 'run')).rejects.toThrow('NO_MAIN_SCENE')
  await f.service.launch(f.project, 'run')
  const old = child()
  old.exitCode = 1; old.emit('exit', 1)
  await f.service.launch(f.project, 'run')
  old.stdout.write('late old output')
  child(1).stdout.write('new output')
  expect((await f.service.snapshot(f.project)).logs).toBe('new output')
})

it('rejects arbitrary paths, PIDs and actions before resolving a workspace; canceled selection is inert', async () => {
  const f = await fixture()
  const resolve = vi.fn(async () => f.project)
  const pick = vi.fn(async () => null)
  for (const request of [{ action: 'run', path: '/other' }, { action: 'stop', pid: 123 }, { action: 'shell' }, { action: 'run' }]) {
    expect((await handleGodotEngineRequest(f.service, request, resolve, pick)).ok).toBe(false)
  }
  expect(resolve).not.toHaveBeenCalled()
  expect((await handleGodotEngineRequest(f.service, { action: 'choose' }, resolve, pick)).ok).toBe(true)
  expect((await f.service.snapshot()).path).toBe(null)
  await f.service.configure(f.executable)
  expect((await handleGodotEngineRequest(f.service, { action: 'run', workspaceId: 'known' }, resolve, pick)).ok).toBe(true)
  expect(resolve).toHaveBeenCalledWith('known')
})

it('exposes named preload methods with fixed IPC actions', async () => {
  const invoke = vi.fn(async () => ({ ok: false as const, code: 'ENGINE_UNAVAILABLE' }))
  const bridge = createGodotEngineBridge(invoke)
  await bridge.run('workspace')
  expect(invoke).toHaveBeenCalledWith('godot-engine:command', { action: 'run', workspaceId: 'workspace' })
  expect(Object.keys(bridge)).toEqual(['status', 'choose', 'open', 'run', 'stop'])
})
