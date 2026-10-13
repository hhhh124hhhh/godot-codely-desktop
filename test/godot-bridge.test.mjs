import { createServer } from 'node:http'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { BridgeServer, TypertClient } from '../packages/dsh-godot-stack/bridge/bridge.mjs'

const cleanups = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const post = (url, body, extra = {}) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) })
async function adapter() {
  const client = {
    ping: async () => ({ ok: true }),
    createSession: async () => ({ sessionId: 'session-a' }),
    call: async () => ({ items: [{ sessionId: 'session-a', cwd: process.cwd() }, { sessionId: 'session-b', cwd: 'elsewhere' }] }),
    page: async (_id, { since }) => ({ records: [], nextSeq: since, hasMore: false }),
    prompt: async () => ({ accepted: true }), cancel: async () => ({ accepted: true }),
  }
  const bridge = new BridgeServer({ client, port: 0, logger: { info() {} } })
  await bridge.start()
  cleanups.push(() => bridge.stop())
  const url = `http://127.0.0.1:${bridge.port}`
  await post(url + '/v1/sessions', { cwd: process.cwd() })
  return { bridge, url, client }
}

describe('Godot Harness adapter', () => {
  it('walks backwards pages to return every new event in forward order, including event zero', async () => {
    const client = new TypertClient('http://127.0.0.1:1')
    const events = Array.from({ length: 7 }, (_, seq) => ({ type: 'event', event: { seq } }))
    client.call = async (endpoint, { request }) => {
      if (endpoint === 'session/projections') return { asOfSeq: 6, values: {} }
      const records = events.slice(Math.max(0, request.beforeSeq - 2), request.beforeSeq)
      return { records, hasMore: records[0].event.seq > 0 }
    }
    expect((await client.page('s')).records.map(record => record.event.seq)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect((await client.page('s', { since: 2 })).records.map(record => record.event.seq)).toEqual([3, 4, 5, 6])
    expect((await client.page('s', { since: 6 })).records).toEqual([])
    await expect(client.page('s', { since: 7 })).rejects.toThrow('cursor')
  })

  it('discovers the real endpoint and reauthenticates after the launch token rotates', async () => {
    const root = await mkdtemp(join(tmpdir(), 'godot token test '))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    let token = 'first'
    let logins = 0
    const server = createServer(async (req, res) => {
      if (req.url.startsWith('/?token=')) {
        expect(decodeURIComponent(req.url.split('=')[1])).toBe(token)
        logins++
        res.writeHead(302, { 'set-cookie': `dsh-auth-test=${token}; HttpOnly` }); res.end(); return
      }
      expect(req.headers.cookie).toBe(`dsh-auth-test=${token}`)
      let text = ''
      for await (const chunk of req) text += chunk
      const request = JSON.parse(text)
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ rpcId: request.rpcId, result: { ok: true, value: { items: [] } } }))
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    cleanups.push(() => new Promise(resolve => server.close(resolve)))
    const tokenFile = join(root, 'launch-token')
    const endpoint = `http://127.0.0.1:${server.address().port}`
    await writeFile(tokenFile, token + '\n' + endpoint + '\n')
    const client = new TypertClient('http://127.0.0.1:1', { tokenFile })
    expect((await client.ping()).ok).toBe(true)
    token = 'second'
    await writeFile(tokenFile, token + '\n' + endpoint + '\n')
    expect((await client.ping()).ok).toBe(true)
    expect(logins).toBe(2)
  })

  it('claims only attached approvals, forwards a one-shot answer and rejects repeat/foreign answers', async () => {
    const { bridge, url } = await adapter()
    expect(await bridge.approval({ agent: { session: { id: 'unrelated' } } }, async () => 'unavailable')).toBe('unavailable')
    const controller = new AbortController()
    const result = bridge.approval({ agent: { session: { id: 'session-a' } }, toolName: 'edit', reason: 'review', signal: controller.signal }, () => { throw Error('must claim') })
    const pending = await (await fetch(url + '/v1/sessions/session-a/events?since=-1')).json()
    const id = pending.approvals[0].id
    expect((await post(url + '/v1/sessions/unrelated/approval', { id, outcome: 'allowed-once' })).status).toBe(409)
    expect((await post(url + '/v1/sessions/session-a/approval', { id, outcome: 'allowed-once' })).status).toBe(200)
    expect(await result).toBe('allowed-once')
    expect((await post(url + '/v1/sessions/session-a/approval', { id, outcome: 'allowed-once' })).status).toBe(409)
    const aborted = bridge.approval({ agent: { session: { id: 'session-a' } }, toolName: 'edit', signal: controller.signal }, async () => 'unavailable')
    controller.abort()
    expect(await aborted).toBe('cancelled')
    expect(bridge.pending.size).toBe(0)
  })

  it('validates resume ownership and preserves the client prompt request ID', async () => {
    const { url, client } = await adapter()
    expect((await post(url + '/v1/sessions', { cwd: process.cwd(), sessionId: 'session-b' })).status).toBe(409)
    expect((await post(url + '/v1/sessions', { cwd: process.cwd(), sessionId: 'session-a' })).status).toBe(200)
    let requestId
    client.prompt = async (_id, _text, id) => { requestId = id; return { accepted: true } }
    expect((await post(url + '/v1/sessions/session-a/prompt', { text: 'task', requestId: 'same-request' })).status).toBe(200)
    expect(requestId).toBe('same-request')
    expect((await post(url + '/v1/sessions/session-a/cancel', {})).status).toBe(200)
    expect((await post(url + '/v1/sessions/session-a/prompt', { text: ' ' })).status).toBe(400)
  })

  it('rejects browser origins and malformed requests before forwarding', async () => {
    const { url } = await adapter()
    expect((await post(url + '/v1/sessions/session-a/cancel', {}, { origin: 'https://untrusted.example' })).status).toBe(403)
    expect((await fetch(url + '/v1/sessions', { method: 'POST', body: '{}' })).status).toBe(415)
    expect((await fetch(url + '/v1/sessions/session-a/events?since=NaN')).status).toBe(400)
  })

  it('withdraws pending decisions and closes the listener on disposal', async () => {
    const { bridge, url } = await adapter()
    const pending = bridge.approval({ agent: { session: { id: 'session-a' } }, toolName: 'edit' }, async () => 'unavailable')
    await bridge.stop()
    expect(await pending).toBe('cancelled')
    await expect(fetch(url + '/v1/health')).rejects.toThrow()
  })
})
