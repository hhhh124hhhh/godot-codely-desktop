/** Loopback adapter; Harness owns execution, durable sessions and approval audits. */
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { TypertClient } from './session-client.mjs'
import { EditorControl } from './editor-control.mjs'
export { TypertClient, defaultTokenFile } from './session-client.mjs'
export const BRIDGE_DEFAULT_PORT = 4399
export const DSH_DEFAULT_PORT = 43129

function invalid(message, status = 400) { return Object.assign(Error(message), { status }) }
function identifier(value) {
  if (typeof value !== 'string' || !/^[\w-]{1,200}$/.test(value)) throw invalid('invalid session/request identifier')
  return value
}
function samePath(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const normalize = value => process.platform === 'win32' ? resolve(value).toLowerCase() : resolve(value)
  return normalize(a) === normalize(b)
}

export class BridgeServer {
  constructor({ port = 4399, dshPort = 43129, host = '127.0.0.1', tokenFile, logger, client } = {}) {
    if (host !== '127.0.0.1') throw Error('Godot bridge must remain on loopback')
    this.port = port
    this.host = host
    this.client = client ?? new TypertClient(`http://127.0.0.1:${dshPort}`, { tokenFile })
    this.logger = logger ?? console
    this.sessions = new Map()
    this.pending = new Map()
    this.editorControl = new EditorControl()
  }

  async start() {
    if (this.server) return
    const server = createServer((req, res) => {
      this.route(req, res).catch(error => {
        if (!res.headersSent) this.json(res, error.status ?? 502, { ok: false, error: error.message })
      })
    })
    this.server = server
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(this.port, this.host, resolve)
      })
      this.port = server.address().port
      server.on('error', error => this.logger.warn?.('godot-bridge: listener error: %s', error.message))
      this.logger.info?.(`godot-bridge: listening on http://${this.host}:${this.port}`)
    } catch (error) { this.server = undefined; throw error }
  }

  async stop() {
    this.editorControl.stop()
    for (const request of this.pending.values()) request.finish('cancelled')
    this.sessions.clear()
    if (!this.server) return
    const server = this.server
    this.server = undefined
    await new Promise(resolve => { server.close(resolve); server.closeIdleConnections() })
  }

  /** Only an attached, heartbeat-active editor claims approvals; other sessions delegate. */
  approval(request, next) {
    const sessionId = request.agent.session.id
    const session = this.sessions.get(sessionId)
    if (!session || Date.now() - session.lastSeen > 15000) return next()
    return new Promise(resolve => {
      const id = randomUUID()
      const aborted = () => finish('cancelled')
      let timer
      const finish = outcome => {
        if (!this.pending.delete(id)) return
        clearInterval(timer)
        request.signal?.removeEventListener('abort', aborted)
        resolve(outcome)
      }
      this.pending.set(id, { sessionId, toolName: request.toolName, reason: request.reason ?? '', finish })
      request.signal?.addEventListener('abort', aborted, { once: true })
      timer = setInterval(() => { if (Date.now() - session.lastSeen > 15000) finish('unavailable') }, 1000)
      timer.unref()
      if (request.signal?.aborted) aborted()
    })
  }

  /** Presentation frames are expendable; the journal remains authoritative on reconnect. */
  assistantStream({ agent, frame }) {
    const session = this.sessions.get(agent.session.id)
    if (!session) return
    session.streamSeq++
    session.stream.push({ seq: session.streamSeq, frame })
    if (session.stream.length > 512) session.stream.shift()
  }

  async route(req, res) {
    const url = new URL(req.url, `http://${this.host}:${this.port}`)
    if (req.headers.origin && req.headers.origin !== url.origin) throw invalid('browser origin is not permitted', 403)
    if (req.method === 'POST' && !/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) throw invalid('application/json required', 415)
    if (req.method === 'GET' && url.pathname === '/v1/health') {
      const dsh = await this.client.ping()
      return this.json(res, dsh.ok ? 200 : 503, { ok: dsh.ok, app: 'Godot Codely', dsh })
    }
    if (req.method === 'POST' && url.pathname === '/v1/editor/poll') {
      return this.json(res, 200, { ok: true, commands: this.editorControl.poll(await this.readJson(req)) })
    }
    if (req.method === 'POST' && url.pathname === '/v1/editor/execute') {
      return this.json(res, 200, await this.editorControl.execute(await this.readJson(req)))
    }
    if (req.method === 'POST' && url.pathname === '/v1/sessions') {
      const body = await this.readJson(req)
      if (typeof body.cwd !== 'string' || !body.cwd.trim()) throw invalid('project cwd required')
      let sessionId
      if (body.sessionId) {
        sessionId = identifier(body.sessionId)
        const list = await this.client.call('session/list', { _request: {} })
        const session = list.items.find(item => item.sessionId === sessionId)
        if (!session || !samePath(session.cwd, body.cwd)) throw invalid('saved session does not belong to this project', 409)
      } else {
        const created = await this.client.createSession({ cwd: body.cwd, preset: body.preset ?? 'godot-codely-lite' })
        sessionId = identifier(created.sessionId)
      }
      const existing = this.sessions.get(sessionId)
      this.sessions.set(sessionId, existing ?? { lastSeen: Date.now(), stream: [], streamSeq: 0 })
      this.sessions.get(sessionId).lastSeen = Date.now()
      return this.json(res, 200, { ok: true, sessionId })
    }
    const match = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/(prompt|cancel|events|approval)$/)
    if (match) {
      const sessionId = identifier(match[1])
      const action = match[2]
      const session = this.sessions.get(sessionId)
      if (!session) throw invalid('session is not attached; reconnect the panel', 409)
      session.lastSeen = Date.now()
      if (req.method === 'POST' && action === 'prompt') {
        const body = await this.readJson(req)
        if (typeof body.text !== 'string' || !body.text.trim()) throw invalid('prompt text required')
        const accepted = await this.client.prompt(sessionId, body.text, identifier(body.requestId ?? randomUUID()))
        return this.json(res, 200, { ok: true, accepted: accepted.accepted === true })
      }
      if (req.method === 'POST' && action === 'cancel') {
        const accepted = await this.client.cancel(sessionId)
        return this.json(res, 200, { ok: true, accepted: accepted.accepted === true })
      }
      if (req.method === 'POST' && action === 'approval') {
        const body = await this.readJson(req)
        if (!['allowed-once', 'rejected'].includes(body.outcome)) throw invalid('invalid approval outcome')
        const pending = this.pending.get(body.id)
        if (!pending || pending.sessionId !== sessionId) throw invalid('approval is no longer pending in this session', 409)
        pending.finish(body.outcome)
        return this.json(res, 200, { ok: true })
      }
      if (req.method === 'GET' && action === 'events') {
        const since = Number(url.searchParams.get('since') ?? '-1')
        const streamSince = Number(url.searchParams.get('streamSince') ?? '0')
        if (!Number.isInteger(since) || since < -1 || !Number.isInteger(streamSince) || streamSince < 0) throw invalid('invalid event cursor')
        const page = await this.client.page(sessionId, { since })
        const approvals = [...this.pending].filter(([, request]) => request.sessionId === sessionId)
          .map(([id, request]) => ({ id, toolName: request.toolName, reason: request.reason }))
        return this.json(res, 200, { ok: true, ...page, approvals,
          stream: session.stream.filter(item => item.seq > streamSince), streamSeq: session.streamSeq })
      }
    }
    throw invalid('unknown Godot bridge route', 404)
  }

  async readJson(req) {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > 256000) throw invalid('request body too large', 413)
      chunks.push(chunk)
    }
    let value
    try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw invalid('invalid JSON') }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('JSON object required')
    return value
  }

  json(res, status, payload) {
    const body = JSON.stringify(payload)
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' })
    res.end(body)
  }
}

if (process.argv[1]?.endsWith('bridge.mjs')) {
  const args = process.argv.slice(2)
  const value = name => { const index = args.indexOf(`--${name}`); return index < 0 ? undefined : args[index + 1] }
  const bridge = new BridgeServer({ port: Number(value('port') ?? 4399), dshPort: Number(value('dsh-port') ?? 43129), tokenFile: value('token-file') })
  await bridge.start()
}
