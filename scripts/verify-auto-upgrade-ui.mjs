/** Drive the shipped updater's actual closed-shadow buttons through loopback CDP. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { parse as parseYaml } from 'yaml'
import { TypertClient } from '../packages/dsh-godot-stack/bridge/session-client.mjs'

const [phase, endpoint, output, home, expectedVersion] = process.argv.slice(2)
assert.ok(['download', 'install', 'verify'].includes(phase))
assert.equal(new URL(endpoint).hostname, '127.0.0.1')
const pause = ms => new Promise(done => setTimeout(done, ms))
const deadline = Date.now() + (phase === 'download' ? 600000 : 180000)
let socket
let send
let lastError
while (Date.now() < deadline) {
  try {
    const targets = await (await fetch(endpoint + '/json/list', { signal: AbortSignal.timeout(3000) })).json()
    const target = targets.find(item => item.type === 'page' && /^http:\/\/127\.0\.0\.1:/.test(item.url))
    assert.ok(target, 'Harness renderer required')
    socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((done, reject) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', reject, { once: true }) })
    let nextId = 0
    send = (method, params = {}) => new Promise((done, reject) => {
      const id = ++nextId
      const timer = setTimeout(() => { socket.removeEventListener('message', receive); reject(Error('CDP timeout: ' + method)) }, 10000)
      function receive(event) {
        const response = JSON.parse(event.data)
        if (response.id !== id) return
        clearTimeout(timer); socket.removeEventListener('message', receive)
        if (response.error) reject(Error(response.error.message)); else done(response.result)
      }
      socket.addEventListener('message', receive)
      socket.send(JSON.stringify({ id, method, params }))
    })
    const state = await send('Runtime.evaluate', { expression: 'Boolean(window.__DSH_BOOT__ && document.querySelector("#root button"))', returnByValue: true })
    assert.equal(state.result?.value, true, 'Hydrated renderer required')
    break
  } catch (error) {
    lastError = error; socket?.close(); await pause(1000)
  }
}
assert.ok(socket?.readyState === WebSocket.OPEN && send, String(lastError))
async function evaluate(expression) {
  const value = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  assert.ok(!value.exceptionDetails, 'Renderer evaluation must succeed')
  return value.result.value
}
async function capture(name) {
  const image = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(output, name + '.png'), Buffer.from(image.data, 'base64'))
}
async function updaterButton(pattern) {
  const { root } = await send('DOM.getDocument', { depth: -1, pierce: true })
  function text(node) { return (node.nodeValue ?? '') + [...node.children ?? [], ...node.shadowRoots ?? []].map(text).join('') }
  function find(node, inside = false) {
    const attrs = node.attributes ?? []
    const owned = inside || attrs.some((value, index) => index % 2 === 0 && value === 'id' && attrs[index + 1] === 'dsh-desktop-update-root')
    if (owned && node.nodeName === 'BUTTON' && pattern.test(text(node))) return node
    for (const child of [...node.children ?? [], ...node.shadowRoots ?? []]) { const found = find(child, owned); if (found) return found }
  }
  return find(root)
}
async function click(node) {
  const { object } = await send('DOM.resolveNode', { nodeId: node.nodeId })
  const result = await send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function(){this.click()}', returnByValue: true })
  assert.ok(!result.exceptionDetails)
}
async function updaterError() {
  const { root } = await send('DOM.getDocument', { depth: -1, pierce: true })
  const children = node => [...node.children ?? [], ...node.shadowRoots ?? []]
  function hasWarning(node) {
    const attrs = node.attributes ?? []
    return attrs.some((value, index) => index % 2 === 0 && value === 'class' && attrs[index + 1].split(/\s+/).includes('warning')) || children(node).some(hasWarning)
  }
  function text(node) { return node.nodeName === 'STYLE' ? '' : (node.nodeValue ?? '') + children(node).map(text).join(' ') }
  function find(node) {
    const attrs = node.attributes ?? []
    if (attrs.some((value, index) => index % 2 === 0 && value === 'id' && attrs[index + 1] === 'dsh-desktop-update-root')) return hasWarning(node) ? text(node) : undefined
    return children(node).map(find).find(Boolean)
  }
  return find(root)
}
const client = new TypertClient('http://127.0.0.1:1', { tokenFile: join(home, 'godot-codely-launch-token') })
try {
  if (phase === 'download') {
    const project = join(output, 'fixture-project')
    await mkdir(project, { recursive: true })
    await writeFile(join(project, 'project.godot'), 'config_version=5\n[application]\nconfig/name="Upgrade recovery fixture"\n')
    const created = await client.call('workspace/create', { request: { path: project } })
    const session = await client.createSession({ workspaceId: created.workspace.workspaceId, preset: 'godot-codely-lite' })
    await client.call('session/rename', { request: { sessionId: session.sessionId, title: 'Upgrade retained session' } })
    await client.call('credentials/set', { ref: 'UPGRADE_FIXTURE_KEY', value: 'non-secret-upgrade-fixture' })
    assert.equal(parseYaml(await readFile(join(home, '.credentials.yaml'), 'utf8')).refs.UPGRADE_FIXTURE_KEY, 'non-secret-upgrade-fixture')
    await client.call('settings/update', { ns: 'locale', patch: { preference: 'en' } })
    await evaluate('localStorage.setItem("upgrade-fixture", "retained-draft-marker")')
    await writeFile(join(output, 'fixture.json'), JSON.stringify({ sessionId: session.sessionId, workspaceId: created.workspace.workspaceId, project, credential: await client.call('credentials/describe', { refs: ['UPGRADE_FIXTURE_KEY'] }) }, null, 2))
    let accepted = false
    while (Date.now() < deadline) {
      const failure = await updaterError()
      if (failure) throw Error('Actual updater rejected the check/download: ' + failure)
      const install = await updaterButton(/^(Restart and install|重新启动并安装)$/i)
      if (install) { await capture('downloaded'); console.log('Real updater download completed'); break }
      if (!accepted) {
        const accept = await updaterButton(/^(Update now|同意更新)$/i)
        if (accept) { await capture('available'); await click(accept); accepted = true; console.log('Accepted actual update offer') }
      }
      await pause(1500)
    }
    assert.ok(await updaterButton(/^(Restart and install|重新启动并安装)$/i), 'Downloaded update must expose restart action')
  } else if (phase === 'install') {
    const action = await updaterButton(/^(Restart and install|重新启动并安装)$/i)
    assert.ok(action, 'Actual restart action required')
    await click(action)
    console.log('Clicked shipped restart/update action')
  } else {
    const fixture = JSON.parse(await readFile(join(output, 'fixture.json'), 'utf8'))
    const list = await client.call('session/list', { _request: {} })
    assert.ok(list.items.some(item => item.id === fixture.sessionId || item.sessionId === fixture.sessionId), 'Session must survive real installer replacement')
    const credentials = await client.call('credentials/describe', { refs: ['UPGRADE_FIXTURE_KEY'] })
    assert.deepEqual(credentials, fixture.credential, 'Fixture credential metadata must survive')
    assert.equal(parseYaml(await readFile(join(home, '.credentials.yaml'), 'utf8')).refs.UPGRADE_FIXTURE_KEY, 'non-secret-upgrade-fixture', 'Fixture credential value must survive, not only its configured flag')
    assert.equal(await evaluate('localStorage.getItem("upgrade-fixture")'), 'retained-draft-marker')
    const settings = JSON.parse(await readFile(join(home, 'settings.json'), 'utf8'))
    assert.equal(settings.locale.preference, 'en')
    await capture('upgraded-ui')
    await writeFile(join(output, 'ui-result.json'), JSON.stringify({ passed: true, expectedVersion, sessionRestored: true, credentialMetadataRestored: true, fixtureCredentialValueRestored: true, settingsRestored: true, desktopStorageRestored: true, limitation: 'fixture version lowered in installed manifest; not official old-release compatibility or human UX acceptance' }, null, 2))
    console.log('Upgraded production UI, session, settings, credential metadata and storage restored')
  }
} catch (error) {
  await capture('failure-' + phase).catch(() => { /* Preserve original failure if the renderer has already exited. */ })
  throw error
} finally { socket.close() }
