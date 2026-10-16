/** Targeted failure evidence; never persists launch-token query strings. */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
const [endpoint, output, stage] = process.argv.slice(2)
const targets = await (await fetch(endpoint + '/json/list', { signal: AbortSignal.timeout(3000) })).json()
await writeFile(join(output, stage + '-targets.json'), JSON.stringify(targets.map(target => ({ type: target.type, url: target.url.split('?')[0] })), null, 2))
const target = targets.find(target => target.type === 'page')
if (!target) process.exit(0)
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((done, reject) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let id = 0
async function send(method, params = {}) {
  const requestId = ++id
  return new Promise((done, reject) => {
    const timer = setTimeout(() => { socket.removeEventListener('message', receive); reject(Error('CDP timeout')) }, 5000)
    function receive(event) {
      const value = JSON.parse(event.data)
      if (value.id !== requestId) return
      clearTimeout(timer); socket.removeEventListener('message', receive)
      if (value.error) reject(Error(value.error.message)); else done(value.result)
    }
    socket.addEventListener('message', receive)
    socket.send(JSON.stringify({ id: requestId, method, params }))
  })
}
try {
  const text = await send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true })
  await writeFile(join(output, stage + '-body.txt'), String(text.result.value).replace(/([?&]token=)[^\s&]+/g, '$1[redacted]'))
  const image = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(output, stage + '.png'), Buffer.from(image.data, 'base64'))
} finally { socket.close() }
