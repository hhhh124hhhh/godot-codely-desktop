import { execFile, spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { StringDecoder } from 'node:string_decoder'
import type { GodotEngineState } from '../shared/godot-engine'

const execFileAsync = promisify(execFile)
const MAX_LOG = 32 * 1024
const MAX_PROJECTS = 16
export interface GodotEngineProject { path: string; mainScene: string }
export type GodotSpawner = (file: string, args: string[], options: SpawnOptions) => ChildProcess
interface RunRecord {
  child?: ChildProcess
  lastChild?: ChildProcess
  editor?: ChildProcess
  logs: string
  truncated: boolean
  exitCode: number | null
  stopping?: Promise<void>
}
export const engineError = (code: string): Error => Object.assign(new Error(code), { code })

/** Owns only processes launched from Desktop; MCP/editor-owned games are separate. */
export class GodotEngineService {
  private path: string | null = null
  private version: string | null = null
  private configurationRevision = 0
  private configuring = false
  private disposed = false
  private readonly projects = new Map<string, RunRecord>()
  private readonly pending = new Set<string>()

  constructor(private readonly pathFile: string, private readonly environmentPath = process.env.GODOT_PATH, private readonly spawnProcess: GodotSpawner = spawn) {}

  private async load(): Promise<void> {
    const revision = this.configurationRevision
    let path: string | null = null
    try { path = (await readFile(this.pathFile, 'utf8')).trim() || null }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
    }
    if (revision !== this.configurationRevision) return
    path ??= this.environmentPath || null
    if (path !== this.path) this.version = null
    this.path = path
  }

  private async validate(path: string): Promise<{ path: string; version: string }> {
    if (!isAbsolute(path)) throw engineError('ENGINE_INVALID')
    let canonical: string
    try {
      canonical = await realpath(path)
      if (!(await stat(canonical)).isFile()) throw engineError('ENGINE_INVALID')
      const { stdout } = await execFileAsync(canonical, ['--version'], { timeout: 5000, maxBuffer: 8192, windowsHide: true })
      const version = stdout.trim()
      if (!/^4\.(?:[1-9]\d*)(?:\.|\s)/.test(version)) throw engineError('ENGINE_VERSION')
      return { path: canonical, version }
    } catch (error) {
      if (error instanceof Error && error.message === 'ENGINE_VERSION') throw error
      throw engineError('ENGINE_INVALID')
    }
  }

  async configure(path: string): Promise<void> {
    if (this.configuring || this.disposed) throw engineError('ENGINE_BUSY')
    this.configuring = true
    const temporary = this.pathFile + '.' + randomUUID() + '.tmp'
    try {
      await this.load()
      const validated = await this.validate(path)
      await mkdir(dirname(this.pathFile), { recursive: true })
      await writeFile(temporary, validated.path + '\n', { mode: 0o600 })
      await rename(temporary, this.pathFile)
      this.configurationRevision++
      this.path = validated.path; this.version = validated.version
    } finally {
      this.configuring = false
      await rm(temporary, { force: true })
    }
  }

  async snapshot(project?: GodotEngineProject): Promise<GodotEngineState> {
    await this.load()
    const record = project ? await this.findRecord(project.path) : undefined
    return {
      path: this.path, version: this.version,
      running: this.alive(record?.child), editorRunning: this.alive(record?.editor),
      exitCode: record?.exitCode ?? null, logs: record?.logs ?? '', truncated: record?.truncated ?? false
    }
  }

  private alive(child?: ChildProcess): boolean { return !!child && child.exitCode === null && child.signalCode === null }

  private async findRecord(path: string): Promise<RunRecord | undefined> {
    // Owned processes must remain stoppable even after their project was moved/deleted.
    const owned = this.projects.get(path)
    if (owned) return owned
    try { return this.projects.get(await realpath(path)) }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
      throw error
    }
  }

  private record(path: string): RunRecord {
    let record = this.projects.get(path)
    if (record) return record
    if (this.projects.size >= MAX_PROJECTS) {
      const stale = [...this.projects].find(([, item]) => !this.alive(item.child) && !this.alive(item.editor))
      if (!stale) throw engineError('ENGINE_BUSY')
      this.projects.delete(stale[0])
    }
    record = { logs: '', truncated: false, exitCode: null }
    this.projects.set(path, record)
    return record
  }

  async launch(project: GodotEngineProject, mode: 'open' | 'run'): Promise<void> {
    const path = await realpath(project.path)
    if (this.disposed || this.pending.has(path)) throw engineError('ENGINE_BUSY')
    this.pending.add(path)
    try {
      await this.load()
      if (!this.path) throw engineError('ENGINE_MISSING')
      if (!(await stat(join(path, 'project.godot'))).isFile()) throw engineError('NOT_GODOT_PROJECT')
      if (mode === 'run' && !project.mainScene) throw engineError('NO_MAIN_SCENE')
      const record = this.record(path)
      const key = mode === 'open' ? 'editor' : 'child'
      if (this.alive(record[key]) || record.stopping) throw engineError('ENGINE_ALREADY_RUNNING')
      const validated = await this.validate(this.path)
      if (this.disposed) throw engineError('ENGINE_BUSY')
      this.version = validated.version
      const child = this.spawnProcess(validated.path, [...(mode === 'open' ? ['--editor'] : []), '--path', path], {
        cwd: path, windowsHide: true, shell: false,
        detached: mode === 'open', stdio: mode === 'open' ? 'ignore' : ['ignore', 'pipe', 'pipe']
      })
      record[key] = child
      if (mode === 'run') {
        record.lastChild = child
        record.logs = ''; record.truncated = false; record.exitCode = null
        for (const stream of [child.stdout, child.stderr]) {
          const decoder = new StringDecoder('utf8')
          const append = (text: string): void => {
            if (record.lastChild !== child) return
            record.logs += text
            if (record.logs.length > MAX_LOG) { record.logs = record.logs.slice(-MAX_LOG); record.truncated = true }
          }
          stream?.on('data', (chunk: Buffer) => append(decoder.write(chunk)))
          stream?.once('end', () => append(decoder.end()))
        }
      }
      child.once('exit', code => {
        if (mode === 'run' && record.lastChild === child) record.exitCode = code
        if (record[key] === child) delete record[key]
      })
      // Keep an error listener for late errors after spawn as well as ENOENT.
      child.on('error', error => {
        if (mode === 'run' && record.lastChild === child) { record.logs = (record.logs + '\n' + error.message).slice(-MAX_LOG); record.exitCode = -1 }
        if (record[key] === child) delete record[key]
      })
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve)
        child.once('error', () => reject(engineError('ENGINE_START_FAILED')))
      })
      if (mode === 'open') child.unref()
    } finally { this.pending.delete(path) }
  }

  async stop(project: GodotEngineProject): Promise<void> {
    const record = await this.findRecord(project.path)
    if (!record || !this.alive(record.child)) return
    if (record.stopping) return record.stopping
    const child = record.child
    if (!child) return
    record.stopping = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { cleanup(); reject(engineError('ENGINE_STOP_TIMEOUT')) }, 5000)
      const cleanup = (): void => { clearTimeout(timeout); child.off('exit', exited) }
      const exited = (): void => { cleanup(); resolve() }
      child.once('exit', exited)
      // Never accept a PID from the renderer or stop a game launched by the editor/MCP.
      if (!child.kill()) { cleanup(); reject(engineError('ENGINE_STOP_FAILED')) }
    })
    try { await record.stopping } finally { delete record.stopping }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    const deadline = Date.now() + 6000
    while (this.pending.size && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
    // Editors stay open so quitting Desktop cannot discard an editing session.
    const results = await Promise.allSettled([...this.projects.keys()].map(path => this.stop({ path, mainScene: '' })))
    for (const result of results) if (result.status === 'rejected') console.warn('[godot-engine] stop during quit failed', result.reason)
  }
}
