import { TypertClient } from './bridge/bridge.mjs'

const base = 'http://127.0.0.1:43129'
const client = new TypertClient(base)
await client.auth()

const list = await client.call('session/list', { _request: {} })
const items = list.items ?? []
console.log('sessions:', items.length)
for (const it of items.slice(0, 3)) {
  const sid = it.sessionId
  const seq = it.projections?.asOfSeq
  console.log('---', sid.slice(0, 26), 'asOf=', seq)
  try {
    const page = await client.call('session/page', {
      request: { address: { kind: 'session', sessionId: sid }, throughSeq: seq, beforeSeq: 1, maxMessages: 200 },
    })
    const recs = page.records ?? []
    console.log('  records:', recs.length)
    const types = {}
    for (const r of recs) {
      const t = r.type === 'event' ? (r.event?.type ?? '?') : r.type
      types[t] = (types[t] ?? 0) + 1
    }
    console.log('  types:', JSON.stringify(types))
    const msgs = recs.filter((r) => r.type === 'event' && r.event?.type === 'message')
    console.log('  messages:', msgs.length)
    for (const m of msgs.slice(-6)) {
      const d = m.event.data
      const c = d.content
      let text = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x.text ?? x.type ?? '').join('|') : JSON.stringify(c).slice(0, 200)
      console.log('  [' + (d.role ?? '?') + '] ' + text.slice(0, 300))
    }
  } catch (e) {
    console.log('  page err:', e.message)
  }
}
process.exit(0)
