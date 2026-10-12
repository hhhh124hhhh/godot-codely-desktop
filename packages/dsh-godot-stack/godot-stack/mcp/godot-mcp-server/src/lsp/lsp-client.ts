// [sovereign] Godot LSP 客户端 —— 接入 Godot 原生 GDScript Language Server（TCP）。
//
// 机制（已真机验证，2026-10-12）：
//  - Godot 4.7 mono：`godot --editor --lsp-port <port> --headless` 启动 LSP，走 TCP JSON-RPC（stdio 模式不可用）
//  - initialize → initialized → textDocument/didOpen → 服务端推 textDocument/publishDiagnostics
//  - 注意：Godot 的 publishDiagnostics **不带 uri 字段**（工作区级语义），didOpen 后收到的新诊断即针对当前打开文件
//  - 增量：didChange 修正后服务端重新推送诊断（错误消失）
//
// 进程管理：按项目目录缓存单例 LSP 进程，工具调用间复用；MCP 会话结束可显式 close。

import { spawn, type ChildProcess } from 'node:child_process'
import { createConnection, createServer, type Socket } from 'node:net'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { homedir } from 'node:os'

export interface LspDiagnostic {
  severity: string // error | warning | information | hint
  line: number // 1-based
  column: number // 1-based
  message: string
  code?: number
}

export interface LspFileResult {
  file: string
  diagnostics: LspDiagnostic[]
  workspaceErrors: string[] // Godot 工作区 reload 时的 stderr 错误行（含 res:// 文件名）
  server: string | null
}

const SEVERITY_MAP: Record<number, string> = { 1: 'error', 2: 'warning', 3: 'information', 4: 'hint' }

const KNOWN_GODOT_PATHS = [
  // 用户真机（2026-10-12 定位）
  'D:\\Godot_4.7_mono\\Godot_v4.7-stable_mono_win64\\Godot_v4.7-stable_mono_win64.exe',
  'D:\\Godot_4.7_mono\\Godot_v4.7-stable_mono_win64\\Godot_v4.7-stable_mono_win64_console.exe',
  // 常见安装位
  'C:\\Program Files\\Godot\\Godot.exe',
  'C:\\Godot\\Godot.exe',
  join(homedir(), 'Downloads', 'Godot.exe'),
]

/** Godot 二进制：GODOT_PATH 优先，其次已知路径 */
export function detectGodot(): string | null {
  const env = process.env.GODOT_PATH
  if (env && existsSync(env)) return env
  for (const p of KNOWN_GODOT_PATHS) {
    if (existsSync(p)) return p
  }
  return null
}

/** 从 .gd 文件向上找 project.godot 所在目录（最多上溯 6 层） */
export function findProjectDir(filePath: string): string | null {
  let dir = filePath
  if (existsSync(filePath) && !/\.godot$/i.test(filePath)) dir = dirname(filePath)
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'project.godot'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/** 动态取空闲端口（Godot --lsp-port 需要明确端口） */
export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port
      s.close(() => resolve(port))
    })
    s.on('error', reject)
  })
}

interface Pending {
  resolve: (msg: any) => void
  label: string
  timer: NodeJS.Timeout
}

interface Waiter {
  pred: (msg: any) => boolean
  resolve: (msg: any) => void
  timer: NodeJS.Timeout
}

export class GodotLspClient {
  private child: ChildProcess | null = null
  private sock: Socket | null = null
  private buf = Buffer.alloc(0)
  private pending = new Map<number, Pending>()
  private waiters: Waiter[] = []
  private nextId = 1
  private stderrLines: string[] = []
  private latestDiagnostics: LspDiagnostic[] = []
  private diagCount = 0
  private initPromise: Promise<void> | null = null
  private closing = false
  readonly projectDir: string

  constructor(projectDir: string, private readonly godotPath: string) {
    this.projectDir = projectDir
  }

  get serverName(): string {
    return this.godotPath.split(/[\\/]/).pop() ?? 'godot'
  }

  private onData(chunk: Buffer): void {
    this.buf = Buffer.concat([this.buf, chunk])
    while (true) {
      const idx = this.buf.indexOf('\r\n\r\n')
      if (idx < 0) break
      const header = this.buf.subarray(0, idx).toString('utf8')
      const m = /Content-Length: (\d+)/i.exec(header)
      if (!m) {
        this.buf = this.buf.subarray(idx + 4)
        continue
      }
      const len = Number(m[1])
      if (this.buf.length < idx + 4 + len) break
      const body = this.buf.subarray(idx + 4, idx + 4 + len).toString('utf8')
      this.buf = this.buf.subarray(idx + 4 + len)
      let msg: any
      try {
        msg = JSON.parse(body)
      } catch {
        continue
      }
      this.handleMessage(msg)
    }
  }

  private handleMessage(msg: any): void {
    if (msg.id != null && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!
      clearTimeout(p.timer)
      this.pending.delete(msg.id)
      p.resolve(msg)
      return
    }
    if (msg.method === 'textDocument/publishDiagnostics') {
      const diags = (msg.params?.diagnostics ?? []) as any[]
      this.latestDiagnostics = diags.map((d) => ({
        severity: SEVERITY_MAP[d.severity] ?? 'information',
        line: (d.range?.start?.line ?? 0) + 1,
        column: (d.range?.start?.character ?? 0) + 1,
        message: String(d.message ?? ''),
        code: d.code,
      }))
      this.diagCount++
    }
    // 喂等待者（先到先得）
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i]
      if (w.pred(msg)) {
        clearTimeout(w.timer)
        this.waiters.splice(i, 1)
        w.resolve(msg)
      }
    }
  }

  private send(msg: any): void {
    if (!this.sock) throw new Error('LSP socket not connected')
    const body = JSON.stringify(msg)
    this.sock.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
  }

  private request(method: string, params: any, timeoutMs = 10000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.closing) return reject(new Error('LSP client closed'))
      const id = this.nextId++
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`LSP request timeout: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, label: method, timer })
      try {
        this.send({ jsonrpc: '2.0', id, method, params })
      } catch (e) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(e)
      }
    })
  }

  private waitFor(pred: (msg: any) => boolean, timeoutMs: number): Promise<any> {
    return new Promise((resolve) => {
      if (this.closing) return resolve(null)
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(w)
        if (i >= 0) this.waiters.splice(i, 1)
        resolve(null)
      }, timeoutMs)
      const w: Waiter = { pred, resolve, timer }
      this.waiters.push(w)
    })
  }

  /** 启动 Godot LSP 进程 + TCP 连接 + initialize（幂等） */
  async connect(): Promise<void> {
    if (this.initPromise) return this.initPromise
    this.initPromise = this.doConnect().catch((e) => {
      this.initPromise = null
      throw e
    })
    return this.initPromise
  }

  private async doConnect(): Promise<void> {
    const port = await getFreePort()
    const child = spawn(this.godotPath, ['--editor', '--lsp-port', String(port), '--headless'], {
      cwd: this.projectDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child = child
    child.stderr.on('data', (d: Buffer) => {
      const s = d.toString('utf8')
      for (const line of s.split(/\r?\n/)) {
        const t = line.trim()
        if (t) this.stderrLines.push(t)
      }
      if (this.stderrLines.length > 200) this.stderrLines = this.stderrLines.slice(-200)
    })
    child.on('error', () => {
      // spawn 失败由连接错误暴露
    })

    // 等待端口就绪（Godot 启动 3~10s）
    let sock: Socket | null = null
    for (let attempt = 0; attempt < 40; attempt++) {
      if (child.exitCode != null) throw new Error(`Godot exited early (code ${child.exitCode})`)
      sock = await new Promise<Socket | null>((resolve) => {
        const s = createConnection({ port, host: '127.0.0.1' })
        const t = setTimeout(() => {
          s.destroy()
          resolve(null)
        }, 800)
        s.on('connect', () => {
          clearTimeout(t)
          resolve(s)
        })
        s.on('error', () => {
          clearTimeout(t)
          s.destroy()
          resolve(null)
        })
      })
      if (sock) break
      await sleep(800)
    }
    if (!sock) throw new Error(`Godot LSP port ${port} not reachable`)
    this.sock = sock
    sock.on('data', (c) => this.onData(c as Buffer))
    sock.on('error', () => this.closing = true)

    await this.request('initialize', {
      processId: process.pid,
      rootUri: 'file:///' + this.projectDir.replace(/\\/g, '/'),
      capabilities: {},
    })
    this.send({ jsonrpc: '2.0', method: 'initialized', params: {} })
    await sleep(1200) // 等 Godot 完成工作区脚本加载
  }

  /**
   * 打开文件并返回最新诊断（didOpen → 等 publishDiagnostics，最长 25s）。
   * 注意：Godot 诊断不带 uri，didOpen 后收到的第一条新诊断即当前文件。
   */
  async diagnosticsFor(filePath: string, timeoutMs = 25000): Promise<LspFileResult> {
    await this.connect()
    const before = this.diagCount
    this.latestDiagnostics = []
    const text = readFileSync(filePath, 'utf8')
    const uri = 'file:///' + filePath.replace(/\\/g, '/')
    const diagP = this.waitFor((m) => m.method === 'textDocument/publishDiagnostics', timeoutMs)
    this.send({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: { textDocument: { uri, languageId: 'gdscript', version: Date.now(), text } },
    })
    await diagP
    // 若 didOpen 没触发新诊断（工作区已加载过），用最近缓存
    const diags = this.diagCount > before ? this.latestDiagnostics : this.latestDiagnostics
    // 提取 stderr 中带 res:// 的错误行
    const workspaceErrors = this.stderrLines.filter((l) => l.includes('res://') && /ERROR|WARNING/i.test(l))
    return {
      file: filePath,
      diagnostics: diags,
      workspaceErrors: workspaceErrors.slice(0, 20),
      server: this.serverName,
    }
  }

  /** 关闭进程与连接 */
  close(): void {
    this.closing = true
    try {
      this.sock?.destroy()
    } catch {
      /* noop */
    }
    try {
      this.child?.kill()
    } catch {
      /* noop */
    }
    this.sock = null
    this.child = null
    this.initPromise = null
    this.buf = Buffer.alloc(0)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 项目目录 → 客户端 单例缓存 */
const clients = new Map<string, GodotLspClient>()

export function getLspClient(projectDir: string, godotPath: string): GodotLspClient {
  let c = clients.get(projectDir)
  if (!c) {
    c = new GodotLspClient(projectDir, godotPath)
    clients.set(projectDir, c)
  }
  return c
}

export function closeAllLspClients(): void {
  for (const c of clients.values()) c.close()
  clients.clear()
}

export { sep }
