import { cp, mkdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, '.build/website')
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/desktop.html', ['desktop.html', 'text/html; charset=utf-8']],
  ['/desktop.css', ['desktop.css', 'text/css; charset=utf-8']],
  ['/desktop.js', ['desktop.js', 'text/javascript; charset=utf-8']],
  ['/brand-mark.svg', ['brand-mark.svg', 'image/svg+xml']]
])

await mkdir(output, { recursive: true })
for (const filename of ['index.html', 'styles.css', 'app.js', 'desktop.html', 'desktop.css', 'desktop.js']) {
  await cp(resolve(root, 'website', filename), resolve(output, filename))
}
await cp(resolve(root, 'build/brand-mark.svg'), resolve(output, 'brand-mark.svg'))
console.log('Website built: .build/website')

if (process.argv.includes('--serve')) {
  const port = Number(process.env.WEBSITE_PORT || 4173)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid WEBSITE_PORT')
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname
    const file = files.get(pathname)
    if (!file || !['GET', 'HEAD'].includes(request.method || '')) {
      response.writeHead(404).end('Not found')
      return
    }
    try {
      const body = await readFile(resolve(output, file[0]))
      response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' })
      response.end(request.method === 'HEAD' ? undefined : body)
    } catch (error) {
      console.error('Website preview read failed:', pathname, error)
      response.writeHead(500).end('Unable to read website asset')
    }
  })
  server.on('error', (error) => {
    console.error('Website preview failed:', error.message)
    process.exitCode = 1
  })
  server.listen(port, '127.0.0.1', () => console.log(`Website preview: http://127.0.0.1:${port}`))
}
