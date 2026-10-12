import { TypertClient } from './bridge/bridge.mjs'

const client = new TypertClient('http://127.0.0.1:43129')
const log = []
try {
  const l = await client.call('session/list', { _request: {} })
  const items = l.items || []
  log.push('items count: ' + items.length)
  const sid = items[0]?.sessionId
  if (!sid) { log.push('no session'); console.log(log.join('\n')); process.exit(0) }
  log.push('using: ' + sid.slice(0, 30) + ' preset=' + (items[0].projections?.values?.agentPreset))
  const p = await client.call('session/prompt', {
    request: {
      requestId: crypto.randomUUID(),
      sessionId: sid,
      mode: 'queue',
      content: [{ type: 'text', text: '回复两个字：就绪' }],
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  })
  log.push('prompt: ' + JSON.stringify(p))
  let last = 0, got = false
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 4000))
    const listN = await client.call('session/list', { _request: {} })
    const itemN = (listN.items || []).find((x) => x.sessionId === sid)
    const through = itemN?.projections?.asOfSeq
    if (through === undefined || through <= last) { log.push('poll' + i + ': asOf=' + through); continue }
    const page = await client.call('session/page', {
      request: { address: { kind: 'session', sessionId: sid }, throughSeq: through, beforeSeq: last + 1, maxMessages: 50 },
    })
    last = through
    const msgs = (page.records || [])
      .filter((r) => r.type === 'event' && r.event && r.event.type === 'message' && r.event.data && r.event.data.role === 'assistant')
      .map((r) => {
        const d = r.event.data
        let t = ''
        if (typeof d.content === 'string') t = d.content
        else if (Array.isArray(d.content)) t = d.content.map((c) => c.text || c.type || '').join('')
        return t.slice(0, 120)
      })
    if (msgs.length) { log.push('ASSISTANT@' + i + ': ' + msgs.join(' | ')); got = true; break }
    const st = (page.records || []).filter((r) => r.type === 'event' && r.event && r.event.type === 'agent-state').map((r) => JSON.stringify(r.event.data || {}).slice(0, 60))
    log.push('poll' + i + ': asOf=' + through + ' msgs=' + msgs.length + (st.length ? ' state=' + st.join(',') : ''))
  }
  if (!got) log.push('NO ASSISTANT REPLY')
} catch (e) { log.push('ERR: ' + e.message) }
console.log(log.join('\n'))
process.exit(0)
