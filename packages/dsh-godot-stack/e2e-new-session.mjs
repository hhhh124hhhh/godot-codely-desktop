import { TypertClient } from './bridge/bridge.mjs'

const client = new TypertClient('http://127.0.0.1:43129')
const log = []
try {
  // 清掉旧会话
  const l = await client.call('session/list', { _request: {} })
  for (const i of l.items || []) {
    try { await client.call('session/delete', { request: { sessionId: i.sessionId } }) } catch {}
  }
  log.push('cleaned old sessions: ' + (l.items || []).length)
  // 创建新会话（standard，验证模型链路）
  let sid
  try {
    const c = await client.call('session/create', { request: { cwd: 'C:\\Users\\Lenovo' } })
    sid = c.sessionId
    log.push('create: ' + sid.slice(0, 30) + ' preset=' + (c.agentPreset || '?'))
  } catch (e) {
    log.push('create err: ' + e.message)
    console.log(log.join('\n'))
    process.exit(0)
  }
  const p = await client.call('session/prompt', {
    request: {
      requestId: crypto.randomUUID(),
      sessionId: sid,
      mode: 'queue',
      content: [{ type: 'text', text: '只回复四个字：链路已通' }],
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
      request: { address: { kind: 'session', sessionId: sid }, throughSeq: through, beforeSeq: through + 1, maxMessages: 200 },
    })
    last = through
    const msgs = (page.records || [])
      .filter((r) => r.type === 'event' && r.event && r.event.type === 'assistant/message')
      .map((r) => {
        const m = r.event.data?.message ?? r.event.data
        let t = ''
        if (typeof m?.content === 'string') t = m.content
        else if (Array.isArray(m?.content)) t = m.content.map((c) => c.text || c.type || '').join('')
        return t.slice(0, 160)
      })
    if (msgs.length) { log.push('ASSISTANT@' + i + ': ' + msgs.join(' | ')); got = true; break }
    const st = (page.records || []).filter((r) => r.type === 'event' && r.event && r.event.type === 'agent-state').map((r) => JSON.stringify(r.event.data || {}).slice(0, 80))
    log.push('poll' + i + ': asOf=' + through + (st.length ? ' state=' + st.join(',') : ''))
  }
  if (!got) log.push('NO ASSISTANT REPLY')
} catch (e) { log.push('ERR: ' + e.message) }
console.log(log.join('\n'))
process.exit(0)
