import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const addon = path.resolve(root, '../../addons/godot_codely_ai')

test('HTTP initialization, tools, errors and real Godot panel state roundtrip', { timeout: 30000 }, async (t) => {
  const home = await mkdtemp(path.join(tmpdir(), 'godot-panel-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const listener = createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const port = listener.address().port
  await new Promise(resolve => listener.close(resolve))
  // Config file exercises the same input as the installed server.
  const serverRoot = await mkdtemp(path.join(root, '.http-test-'))
  t.after(() => rm(serverRoot, { recursive: true, force: true }))
  await cp(path.join(root, 'build'), path.join(serverRoot, 'build'), { recursive: true })
  await writeFile(path.join(serverRoot, 'package.json'), '{"type":"module"}')
  await writeFile(path.join(serverRoot, 'godot-mcp-server.config.json'), JSON.stringify({ port }))
  // The temporary server resolves the package's dependencies through its parent.
  const env = { ...process.env, MCP_TRANSPORT: 'http', DSH_HOME: home, GODOT_PROJECT_PATH: home }
  const child = spawn(process.execPath, [path.join(serverRoot, 'build/index.js')], { env, windowsHide: true })
  t.after(() => child.kill())
  let diagnostics = ''
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out: ' + diagnostics)), 10000)
    child.stderr.on('data', chunk => {
      diagnostics += chunk
      if (diagnostics.includes('HTTP 端点已起')) { clearTimeout(timer); resolve() }
    })
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${diagnostics}`)) })
  })
  const url = `http://127.0.0.1:${port}/api`
  let sid = ''
  let id = 0
  const rpc = async (method, params = {}, endpoint = url, session = sid) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(session ? { 'Mcp-Session-Id': session } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
      signal: AbortSignal.timeout(3000),
    })
    assert.match(response.headers.get('content-type'), /application\/json/)
    return { response, body: await response.json() }
  }
  const initialized = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
  assert.equal(initialized.response.status, 200)
  assert.ok(initialized.body.result.serverInfo)
  sid = initialized.response.headers.get('mcp-session-id')
  assert.ok(sid)
  const tools = await rpc('tools/list')
  assert.ok(tools.body.result.tools.some(tool => tool.name === 'config'))
  const state = await rpc('tools/call', { name: 'config', arguments: { action: 'state' } })
  assert.equal(state.body.result.structuredContent.editor_plugin, null)
  await mkdir(path.join(home, '.godot'))
  await writeFile(path.join(home, '.godot/state.json'), '{invalid')
  const corrupt = await rpc('tools/call', { name: 'config', arguments: { action: 'state' } })
  assert.equal(corrupt.body.result.isError, true)
  assert.match(corrupt.body.result.content[0].text, /Cannot read editor state/)
  await rm(path.join(home, '.godot/state.json'))
  const unknown = await rpc('tools/call', { name: 'missing_tool', arguments: {} })
  assert.equal(unknown.body.result.isError, true)
  const missing = await rpc('tools/list', {}, url, 'missing-session')
  assert.equal(missing.response.status, 404)
  const trailingSlash = await rpc('tools/list', {}, url + '/')
  assert.ok(trailingSlash.body.result.tools.length)
  const notification = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Mcp-Session-Id': sid },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), signal: AbortSignal.timeout(3000),
  })
  assert.equal(notification.status, 202)
  assert.equal(await notification.text(), '')
  const get = await fetch(url, { signal: AbortSignal.timeout(3000) })
  assert.equal(get.status, 405)
  const malformed = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{invalid', signal: AbortSignal.timeout(3000) })
  assert.equal(malformed.status, 400)
  const removed = await fetch(url, { method: 'DELETE', headers: { 'Mcp-Session-Id': sid }, signal: AbortSignal.timeout(3000) })
  assert.equal(removed.status, 200)
  const expired = await rpc('tools/list')
  assert.equal(expired.response.status, 404)
  // The standard SDK client must still discover and call tools over /mcp SSE.
  const sdkClient = new Client({ name: 'sdk-http-regression', version: '1' })
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`))
  t.after(() => sdkClient.close())
  await sdkClient.connect(transport)
  assert.ok((await sdkClient.listTools()).tools.some(tool => tool.name === 'config'))
  const sdkState = await sdkClient.callTool({ name: 'config', arguments: { action: 'state' } })
  assert.equal(sdkState.structuredContent.editor_plugin, null)
  await transport.terminateSession()
  await sdkClient.close()
  const godot = process.env.GODOT_TEST_BIN
  if (godot) {
    const project = path.join(home, 'project')
    await mkdir(project)
    await cp(addon, path.join(project, 'addons/godot_codely_ai'), { recursive: true })
    await cp(path.join(root, 'tests/panel-smoke.gd'), path.join(project, 'panel-smoke.gd'))
    const userData = path.join(home, 'userdata').replaceAll('\\', '/')
    await mkdir(userData)
    await writeFile(path.join(project, 'project.godot'), `config_version=5\n[application]\nconfig/name="panel-smoke"\nconfig/use_custom_user_dir=true\nconfig/custom_user_dir_name=${JSON.stringify(userData)}\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n`)
    const editor = spawn(godot, ['--headless', '--path', project, '--script', path.join(project, 'panel-smoke.gd')], {
      env: { ...env, GODOT_TEST_URL: url }, windowsHide: true,
    })
    t.after(() => editor.kill())
    let output = ''
    editor.stdout.on('data', chunk => { output += chunk })
    editor.stderr.on('data', chunk => { output += chunk })
    const [code] = await once(editor, 'exit')
    assert.equal(code, 0, output)
    assert.match(output, /PANEL_CONNECTED_AND_STATE_VERIFIED/)
    const persisted = JSON.parse(await readFile(path.join(home, '.godot/state.json'), 'utf8'))
    assert.equal(persisted.project, 'panel-smoke')
  } else {
    t.diagnostic('GODOT_TEST_BIN unset: actual Godot panel check skipped')
  }
})
