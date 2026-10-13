/** Adapter for the locked Harness 0.2 Session unary protocol; credentials remain in the host process. */
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { tokenCandidatePaths } from '../data-home.mjs'

export function defaultTokenFile() {
  const candidates = tokenCandidatePaths()
  return candidates.find(candidate => existsSync(candidate)) ?? candidates[0]
}

export class TypertClient {
  constructor(baseUrl, { tokenFile } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.tokenFile = tokenFile ?? defaultTokenFile()
  }

  refreshCredentials() {
    const lines = readFileSync(this.tokenFile, 'utf8').trim().split(/\r?\n/)
    const token = lines[0]
    if (!token) throw Error('Harness launch token is empty')
    if (lines[1]) {
      const endpoint = new URL(lines[1])
      if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.username || endpoint.password) {
        throw Error('Harness launch endpoint must be loopback HTTP')
      }
      this.baseUrl = endpoint.origin
    }
    if (this.token !== token || this.authUrl !== this.baseUrl) this.cookie = undefined
    this.token = token
    this.authUrl = this.baseUrl
  }

  async auth() {
    try {
      this.refreshCredentials()
      if (this.cookie !== undefined) return true
      const response = await fetch(`${this.baseUrl}/?token=${encodeURIComponent(this.token)}`, {
        redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { accept: 'text/html' },
      })
      const cookies = response.headers.getSetCookie()
      const cookie = cookies.find(value => value.startsWith('dsh-auth-'))
      if (!cookie) return false
      this.cookie = cookie.split(';')[0]
      return true
    } catch {
      // Health callers receive false; business calls turn this into an explicit authentication failure.
      return false
    }
  }

  async call(endpoint, args, { signal } = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!(await this.auth())) throw Error(`DSH API ${endpoint}: launch token/cookie authentication failed`)
      const rpcId = randomUUID()
      const response = await fetch(`${this.baseUrl}/api/${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: this.cookie },
        body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload: { args } }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
      })
      if ((response.status === 401 || response.status === 403) && attempt === 0) {
        this.cookie = undefined
        continue // Only retry a rejected authentication, never ambiguous network errors or admitted prompts.
      }
      if (!response.ok) throw Error(`DSH API ${endpoint}: HTTP ${response.status}`)
      const full = await response.json()
      if (full.rpcId !== rpcId) throw Error(`DSH API ${endpoint}: rpcId mismatch`)
      if (full.result?.ok === false) {
        throw Error(`DSH API ${endpoint}: ${full.result.error?.code ?? 'error'} ${full.result.error?.message ?? ''}`.trim())
      }
      if (!full.result || full.result.ok !== true) throw Error(`DSH API ${endpoint}: invalid result envelope`)
      return full.result.value
    }
  }

  createSession({ cwd, preset } = {}) {
    return this.call('session/create', { request: { ...(cwd ? { cwd } : {}), ...(preset ? { agentPreset: preset } : {}) } })
  }

  prompt(sessionId, text, requestId = randomUUID()) {
    return this.call('session/prompt', { request: {
      requestId, sessionId, mode: 'queue', content: [{ type: 'text', text }],
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    } })
  }

  async page(sessionId, { since = -1, limit = 50 } = {}) {
    // List metadata may be cached in a different sequence space. Read the authoritative journal cut.
    const snapshot = await this.call('session/projections', { request: { sessionId } })
    const throughSeq = snapshot.asOfSeq
    if (!Number.isInteger(throughSeq) || throughSeq < -1) throw Error('Invalid Harness journal cursor')
    if (since > throughSeq) throw Error('Panel cursor exceeds the journal; reset the local session cursor')
    if (since === throughSeq) return { records: [], hasMore: false, nextSeq: since, projections: snapshot.values }
    const records = new Map()
    let beforeSeq = throughSeq + 1
    // Harness pages backwards. Walk to our committed cursor before exposing the ordered suffix.
    for (let count = 0; count < 200; count++) {
      const page = await this.call('session/page', { request: {
        address: { kind: 'session', sessionId }, throughSeq, beforeSeq, maxMessages: limit,
      } })
      const events = (page.records ?? []).filter(record => record.type === 'event' && Number.isInteger(record.event?.seq))
      for (const record of events) if (record.event.seq > since) records.set(record.event.seq, record)
      const firstSeq = Math.min(...events.map(record => record.event.seq))
      if (!page.hasMore || firstSeq <= since + 1) {
        const ordered = [...records.values()].sort((a, b) => a.event.seq - b.event.seq)
        if (ordered.length && ordered[0].event.seq !== since + 1) throw Error('Harness journal suffix is incomplete')
        return { records: ordered, hasMore: false, nextSeq: throughSeq, projections: snapshot.values }
      }
      if (!Number.isFinite(firstSeq) || firstSeq >= beforeSeq) throw Error('Harness history page made no progress')
      beforeSeq = firstSeq
    }
    throw Error('Harness history exceeds the panel replay limit; open this session in the desktop')
  }

  cancel(sessionId) { return this.call('session/cancel', { request: { sessionId } }) }

  async ping() {
    try { await this.call('session/list', { _request: {} }); return { ok: true } }
    catch (error) { return { ok: false, error: error.message } }
  }
}
