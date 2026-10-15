import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { WebSocketServer } from 'ws'
import { expect, it } from 'vitest'

const run = promisify(execFile)

it('checks the mounted renderer through CDP and saves the returned screenshot', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'installed-ui-test-'))
  const methods = []
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify([{ type: 'page', url: 'http://127.0.0.1:12345/', webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}` }]))
  })
  const sockets = new WebSocketServer({ server })
  sockets.on('connection', socket => socket.on('message', bytes => {
    const request = JSON.parse(bytes)
    methods.push(request.method)
    socket.send(JSON.stringify({ id: request.id, result: request.method === 'Runtime.evaluate'
      ? { result: { value: { bootstrap: true, composer: true, navigation: true, recovery: false } } }
      : { data: Buffer.from('screenshot-fixture').toString('base64') } }))
  }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const screenshot = join(directory, 'ui.png')
    const result = await run(process.execPath, [resolve('scripts/verify-installed-ui.mjs'), `http://127.0.0.1:${server.address().port}`, screenshot], { timeout: 10_000 })
    expect(result.stdout).toContain('composer mounted')
    expect(methods).toEqual(['Runtime.evaluate', 'Page.captureScreenshot'])
    expect(await readFile(screenshot, 'utf8')).toBe('screenshot-fixture')
  } finally {
    for (const client of sockets.clients) client.terminate()
    await new Promise(resolve => sockets.close(resolve))
    await new Promise(resolve => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
  }
})

it('rejects a non-loopback debugging endpoint', async () => {
  await expect(run(process.execPath, [resolve('scripts/verify-installed-ui.mjs'), 'http://example.com'])).rejects.toThrow()
})
