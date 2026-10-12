import { TypertClient } from './bridge/bridge.mjs'

const client = new TypertClient('http://127.0.0.1:43129')
await client.auth()

const list = await client.call('session/list', { _request: {} })
const items = list.items ?? []
console.log('sessions:', items.length)
for (const it of items.slice(0, 3)) {
  const sid = it.sessionId
  const seq = it.projections?.asOfSeq
  console.log('---', sid.slice(0, 26), 'asOf=', seq)
  const page = await client.call('session/page', {
    request: { address: { kind: 'session', sessionId: sid }, throughSeq: seq, beforeSeq: seq, maxMessages: 300 },
  })
  const recs = page.records ?? []
  console.log('  records:', recs.length)
  for (const r of recs) {
    if (r.type !== 'event' || !r.event) continue
    const ev = r.event
    const t = ev.type
    let body = ''
    if (t === 'assistant/message' || t === 'user/message' || t === 'system/message' || t === 'developer/message') {
      const m = ev.data?.message ?? ev.data
      const c = m?.content
      body = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x.text ?? x.type ?? '').join('|') : JSON.stringify(c).slice(0, 300)
    } else if (t === 'tool/call') {
      body = ev.data?.name + ' ' + String(ev.data?.arguments ?? '').slice(0, 120)
    } else if (t === 'tool/result') {
      body = 'tool-result'
    } else if (t === 'approval/asked') {
      body = 'APPROVAL:' + ev.data?.toolName + ' ' + (ev.data?.reason ?? '')
    } else if (t === 'agent-state') {
      body = 'state=' + ev.data?.state
    } else {
      body = JSON.stringify(ev.data ?? {}).slice(0, 100)
    }
    console.log('  [' + t + '] ' + body.slice(0, 200))
  }
}
process.exit(0)
