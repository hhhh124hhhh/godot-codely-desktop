import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { TypertClient } from '../packages/dsh-godot-stack/bridge/session-client.mjs'

// Observe the installed Electron renderer through loopback CDP. HTTP readiness
// alone cannot prove that the bootstrap registered or React mounted.
const [endpoint, screenshot, harnessHome] = process.argv.slice(2)
if (!endpoint || new URL(endpoint).hostname !== '127.0.0.1') throw new Error('Loopback CDP endpoint required')
const deadline = Date.now() + 120_000
let lastFailure = 'No application renderer found'
while (Date.now() < deadline) {
  let socket
  try {
    const targets = await (await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(3000) })).json()
    const target = targets.find(item => item.type === 'page' && /^http:\/\/127\.0\.0\.1:/.test(item.url))
    if (!target) throw new Error('Application page not yet available')
    socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    let nextId = 0
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId
      const timer = setTimeout(() => { socket.removeEventListener('message', receive); reject(new Error(`CDP timeout: ${method}`)) }, 5000)
      function receive(event) {
        const message = JSON.parse(event.data)
        if (message.id !== id) return
        clearTimeout(timer)
        socket.removeEventListener('message', receive)
        if (message.error) reject(new Error(message.error.message))
        else resolve(message.result)
      }
      socket.addEventListener('message', receive)
      socket.send(JSON.stringify({ id, method, params }))
    })
    const result = await send('Runtime.evaluate', {
      expression: `(() => {
        const editable = '[contenteditable]:not([contenteditable="false"]), textarea'
        const buttons = [...document.querySelectorAll('button')]
        buttons.find(button => /^(Maybe later|稍后再说|以后再说)$/.test(button.textContent.trim()))?.click()
        if (!document.querySelector(editable) && !window.__seedSmokeOpenedChat) {
          const create = buttons.find(button => /^(新会话|New (chat|session))$/i.test(button.textContent.trim()))
          if (create) { window.__seedSmokeOpenedChat = true; create.click() }
        }
        const text = document.body.innerText
        return {
          bootstrap: Boolean(window.__ModuleLoader__),
          composer: Boolean(document.querySelector(editable)),
          navigation: /新会话|New (chat|session)/i.test(text),
          recovery: /发现导致启动失败的插件|Plugins preventing startup/.test(text)
        }
      })()`,
      returnByValue: true
    })
    const state = result.result?.value
    if (!state?.bootstrap || !state.composer || !state.navigation || state.recovery) {
      throw new Error(`Installed renderer state: ${JSON.stringify(state)}`)
    }
    if (harnessHome) {
      const client = new TypertClient('http://127.0.0.1:1', { tokenFile: join(harnessHome, 'godot-codely-launch-token') })
      const { presets } = await client.call('agentPresets/list', {})
      for (const id of ['godot-codely-lite', 'godot-scene-expert', 'godot-shader-expert', 'godot-gdscript-expert']) {
        if (!presets.some(preset => preset.id === id && !preset.broken)) throw new Error(`Missing or broken installed preset: ${id}`)
      }
      const project = join(harnessHome, 'seed-smoke-project')
      await mkdir(project, { recursive: true })
      const workspace = await client.call('workspace/create', { request: { path: project } })
      if (!workspace.workspace?.workspaceId) throw new Error('Installed workspace creation failed')
      const session = await client.createSession({ cwd: project, preset: 'godot-codely-lite' })
      if (session.agentPreset !== 'godot-codely-lite') throw new Error('Installed Lite session creation failed')
      console.log('Installed four Godot presets and production Lite session creation passed')
    }
    if (screenshot) {
      const capture = await send('Page.captureScreenshot', { format: 'png' })
      await writeFile(screenshot, Buffer.from(capture.data, 'base64'))
    }
    console.log('Installed client bootstrap, navigation and composer mounted; no recovery page')
    process.exitCode = 0
    break
  } catch (error) {
    lastFailure = error.message
    process.exitCode = 1
    await new Promise(resolve => setTimeout(resolve, 1000))
  } finally {
    socket?.close()
  }
}
if (process.exitCode) throw new Error(lastFailure)
