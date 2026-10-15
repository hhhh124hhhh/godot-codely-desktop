import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:net'
import { TypertClient } from '../packages/dsh-godot-stack/bridge/session-client.mjs'

const exec = promisify(execFile)
const delay = ms => new Promise(done => setTimeout(done, ms))

async function debugPort() {
  const server = createServer()
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  const port = server.address().port
  await new Promise((done, reject) => server.close(error => error ? reject(error) : done()))
  return port
}

async function connect(url) {
  const socket = new WebSocket(url)
  await new Promise((done, reject) => {
    socket.addEventListener('open', done, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let sequence = 0
  const pending = new Map()
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    clearTimeout(request.timer)
    if (message.error) request.reject(new Error(JSON.stringify(message.error)))
    else request.resolve(message.result)
  })
  return {
    close: () => socket.close(),
    send(method, params = {}) {
      return new Promise((done, reject) => {
        const id = ++sequence
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 10_000)
        pending.set(id, { resolve: done, reject, timer })
        socket.send(JSON.stringify({ id, method, params }))
      })
    }
  }
}

async function smoke(executable, root, output) {
  const config = join(root, 'config')
  const port = await debugPort()
  const environment = { ...process.env, HOME: root, XDG_CONFIG_HOME: config, XDG_CACHE_HOME: join(root, 'cache'), XDG_DATA_HOME: join(root, 'data') }
  delete environment.ELECTRON_RUN_AS_NODE
  delete environment.DSH_HOME
  const child = spawn(executable, [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], {
    cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'], detached: true
  })
  let diagnostics = ''
  let launchError
  const append = chunk => { diagnostics = (diagnostics + chunk.toString()).slice(-20_000) }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  child.on('error', error => { launchError = error })
  let cdp
  try {
    const deadline = Date.now() + 180_000
    while (Date.now() < deadline) {
      if (launchError) throw launchError
      if (child.exitCode !== null) throw new Error(`AppImage exited with ${child.exitCode}`)
      if (!cdp) {
        const targets = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) }).then(response => response.json()).catch(() => [])
        const page = targets.find(target => target.type === 'page' && /^http:\/\/127\.0\.0\.1:/.test(target.url))
        if (page) cdp = await connect(page.webSocketDebuggerUrl)
      }
      if (cdp) {
        const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
          expression: `Boolean(window.__DSH_BOOT__ && [...document.querySelectorAll('#root button, #root textarea')].some(element => Object.keys(element).some(key => key.startsWith('__reactProps$'))))`,
          returnByValue: true
        })
        if (exceptionDetails) throw new Error('Renderer evaluation failed')
        if (result.value) {
          const image = await cdp.send('Page.captureScreenshot', { format: 'png' })
          await writeFile(join(output, 'desktop.png'), Buffer.from(image.data, 'base64'))
          const home = join(config, 'godot-codely', 'harness')
          const patch = await readFile(join(home, 'desktop-host-sources.patch.yml'), 'utf8')
          assert(!patch.includes('dsh-desktop-office'), 'Linux must not activate the omitted Office payload')
          const client = new TypertClient('http://127.0.0.1:1', { tokenFile: join(home, 'godot-codely-launch-token') })
          const { presets } = await client.call('agentPresets/list', {})
          for (const id of ['godot-codely-lite', 'godot-scene-expert', 'godot-shader-expert', 'godot-gdscript-expert']) {
            const preset = presets.find(preset => preset.id === id)
            assert(preset && !preset.broken, `Missing or broken packaged preset: ${id}`)
          }
          console.log('Linux extracted AppImage: authenticated Harness, four presets, bootstrap and hydrated React UI passed')
          return
        }
      }
      await delay(500)
    }
    throw new Error('Packaged Linux UI did not mount within 180 seconds')
  } catch (error) {
    // The fixture has no credentials; still redact launch tokens from Chromium output.
    throw new Error(`${error.message}\n${diagnostics.replace(/([?&]token=)[^\s&]+/g, '$1[redacted]')}`, { cause: error })
  } finally {
    cdp?.close()
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
    }
  }
}

if (process.platform !== 'linux') throw new Error('AppImage smoke requires native Linux')
const image = (await readdir(resolve('dist'))).find(name => name.endsWith('.AppImage'))
assert(image, 'Missing AppImage')
const output = resolve('artifacts/linux-smoke')
await mkdir(output, { recursive: true })
const root = await mkdtemp(join(tmpdir(), 'godot-linux-appimage-'))
try {
  await exec(resolve('dist', image), ['--appimage-extract'], { cwd: root, maxBuffer: 16 * 1024 * 1024 })
  const app = join(root, 'squashfs-root')
  // Ubuntu CI restricts unprivileged user namespaces. Use Chromium's real
  // setuid sandbox on this disposable extraction; do not disable the sandbox.
  if (process.env.CI === 'true') {
    await exec('sudo', ['chown', 'root:root', join(app, 'chrome-sandbox')])
    await exec('sudo', ['chmod', '4755', join(app, 'chrome-sandbox')])
  }
  await smoke(join(app, 'godot-codely'), root, output)
} finally {
  await rm(root, { recursive: true, force: true })
}
