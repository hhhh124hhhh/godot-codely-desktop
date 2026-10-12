/**
 * godot-codely bridge — 桌面端 <-> Godot 编辑器桥接服务。
 *
 * 位置：跑在 Godot Codely 桌面端进程内（由 dsh-godot-stack 插件启动）。
 * 职责：把 DSH core 的 Typert Remote API（HTTP JSON-RPC，默认 127.0.0.1:43129）
 * 封装成 Godot 面板友好的简化 REST：
 *
 *   GET  /v1/health                      → 连接探测
 *   POST /v1/sessions {cwd,preset}       → 创建会话（session/create）
 *   POST /v1/sessions/:id/prompt {text}  → 发消息（session/prompt）
 *   GET  /v1/sessions/:id/events?since=N → 增量事件（session/page 轮询）
 *   POST /v1/sessions/:id/cancel         → 取消（session/cancel）
 *
 * 鉴权：DSH web server 用 launch-token 换取签名 cookie（dsh-auth-*）。
 * 桌面端在 harness 启动时把 launch token 写入
 *   <dshHome>/godot-codely-launch-token
 * bridge 启动时读取 → GET /?token=<launchToken>（redirect manual）→ 抓 Set-Cookie →
 * 之后的 Typert 请求携带该 cookie。
 *
 * 独立调试：node bridge/bridge.mjs --port 4399 --dsh-port 43129
 */
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const BRIDGE_DEFAULT_PORT = 4399
export const DSH_DEFAULT_PORT = 43129

/** 默认 launch-token 文件（与 harness-runtime 写盘路径一致）。 */
export function defaultTokenFile() {
  if (process.env.GODOT_CODELY_TOKEN_FILE) return process.env.GODOT_CODELY_TOKEN_FILE
  return join(homedir(), '.dsh', 'godot-codely-launch-token')
}

/** 最小 Typert unary 客户端（只实现需要的 endpoint，不依赖任何 DSH 内部包）。 */
export class TypertClient {
  constructor(baseUrl, { tokenFile } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.tokenFile = tokenFile ?? defaultTokenFile()
    this.cookie = undefined // 交换到的 DSH 签名 cookie
  }

  /** 读取 launch token 并交换签名 cookie。 */
  async auth() {
    if (this.cookie !== undefined) return true
    let token
    try {
      token = readFileSync(this.tokenFile, 'utf8').trim().split('\n')[0]
    } catch {
      return false // 桌面端尚未就绪/无 token 文件
    }
    if (!token) return false
    try {
      const response = await fetch(`${this.baseUrl}/?token=${encodeURIComponent(token)}`, {
        redirect: 'manual',
        headers: { accept: 'text/html' },
      })
      const setCookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : [])
      const sessionCookie = setCookies.find((c) => c.startsWith('dsh-auth-'))
      if (sessionCookie) {
        this.cookie = sessionCookie.split(';')[0]
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async call(endpoint, args, { signal } = {}) {
    const rpcId = randomUUID()
    const headers = { 'content-type': 'application/json' }
    if (this.cookie !== undefined) headers.cookie = this.cookie
    const response = await fetch(`${this.baseUrl}/api/${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'client-request',
        rpcId,
        method: endpoint,
        payload: { args },
      }),
      signal,
    })
    if (!response.ok) {
      throw new Error(`DSH API ${endpoint}: HTTP ${response.status}`)
    }
    const full = await response.json()
    if (full.rpcId !== rpcId) {
      throw new Error(`DSH API ${endpoint}: rpcId mismatch`)
    }
    const result = full.result
    if (result && result.ok === false) {
      const detail = result.error
      throw new Error(`DSH API ${endpoint}: ${detail?.code ?? 'error'} ${detail?.message ?? ''}`.trim())
    }
    return result?.value ?? result
  }

  async createSession({ cwd, preset } = {}) {
    const args = {}
    if (cwd) args.cwd = cwd
    if (preset) args.agentPreset = preset
    return this.call('session/create', args)
  }

  async prompt(sessionId, text) {
    const args = {
      requestId: randomUUID(),
      sessionId,
      mode: 'queue',
      content: [{ type: 'text', text }],
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
    return this.call('session/prompt', args)
  }

  async page(sessionId, { since = 0, limit = 50 } = {}) {
    const args = {
      address: { sessionId },
      throughSeq: 2 ** 31 - 1, // "最新水位"：从 since 之后往回分页
      beforeSeq: since + 1,
      maxMessages: limit,
    }
    return this.call('session/page', args)
  }

  async cancel(sessionId) {
    return this.call('session/cancel', { sessionId })
  }

  async ping() {
    try {
      await this.auth()
      // 用一个轻量 remote 探测：list 返回会话列表
      const value = await this.call('session/list', { limit: 1 })
      return { ok: true, sessions: value }
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) }
    }
  }
}

/** 简化 REST 桥服务。 */
export class BridgeServer {
  constructor({ port = BRIDGE_DEFAULT_PORT, dshPort = DSH_DEFAULT_PORT, host = '127.0.0.1', tokenFile, logger } = {}) {
    this.port = port
    this.host = host
    this.client = new TypertClient(`http://127.0.0.1:${dshPort}`, { tokenFile })
    this.logger = logger ?? console
    this.server = null
    this.sessions = new Map() // sessionId -> { events: [], lastSeq }
  }

  start() {
    this.server = createServer((req, res) => {
      this.#route(req, res).catch((error) => {
        this.#json(res, 500, { ok: false, error: String(error?.message ?? error) })
      })
    })
    this.server.listen(this.port, this.host, () => {
      this.logger.info?.(`godot-bridge: listening on http://${this.host}:${this.port}`)
    })
  }

  stop() {
    if (this.server) {
      this.server.close()
      this.server = null
    }
  }

  async #route(req, res) {
    const url = new URL(req.url, `http://${this.host}:${this.port}`)
    const method = req.method ?? 'GET'

    // GET /v1/health
    if (method === 'GET' && url.pathname === '/v1/health') {
      const dsh = await this.client.ping()
      return this.#json(res, 200, {
        ok: true,
        app: 'Godot Codely',
        bridge: '0.1.0',
        dsh,
      })
    }

    // POST /v1/sessions
    if (method === 'POST' && url.pathname === '/v1/sessions') {
      const body = await this.#readJson(req)
      const created = await this.client.createSession({ cwd: body?.cwd, preset: body?.preset })
      const sessionId = created.sessionId
      this.sessions.set(sessionId, { events: [], lastSeq: 0 })
      return this.#json(res, 200, { ok: true, sessionId, agentPreset: created.agentPreset })
    }

    // /v1/sessions/:id/...
    const match = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/(prompt|cancel|events)$/)
    if (match) {
      const [, sessionId, action] = match
      if (method === 'POST' && action === 'prompt') {
        const body = await this.#readJson(req)
        const accepted = await this.client.prompt(sessionId, body?.text ?? '')
        return this.#json(res, 200, { ok: true, accepted: accepted.accepted ?? true })
      }
      if (method === 'POST' && action === 'cancel') {
        await this.client.cancel(sessionId)
        return this.#json(res, 200, { ok: true })
      }
      if (method === 'GET' && action === 'events') {
        const since = Number(url.searchParams.get('since') ?? '0') || 0
        const page = await this.client.page(sessionId, { since, limit: 50 })
        const records = page.records ?? []
        const nextSeq = records.reduce((max, r) => Math.max(max, r.seq ?? 0), since)
        return this.#json(res, 200, { ok: true, records, nextSeq, hasMore: page.hasMore ?? false })
      }
    }

    return this.#json(res, 404, { ok: false, error: `no route: ${method} ${url.pathname}` })
  }

  async #readJson(req) {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString('utf8')
    if (!raw.trim()) return {}
    return JSON.parse(raw)
  }

  #json(res, status, payload) {
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
    })
    res.end(body)
  }
}

// 独立调试入口：node bridge/bridge.mjs --port 4399 --dsh-port 43129
if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('bridge.mjs')) {
  const args = process.argv.slice(2)
  const flag = (name) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? Number(args[i + 1]) : undefined
  }
  const strFlag = (name) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? args[i + 1] : undefined
  }
  const server = new BridgeServer({
    port: flag('port') ?? BRIDGE_DEFAULT_PORT,
    dshPort: flag('dsh-port') ?? DSH_DEFAULT_PORT,
    tokenFile: strFlag('token-file'),
  })
  server.start()
  console.log(`bridge standalone on :${server.port}, dsh at :${server.client.baseUrl}`)
}
