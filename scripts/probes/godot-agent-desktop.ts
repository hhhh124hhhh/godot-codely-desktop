import { app, BrowserWindow, ipcMain } from 'electron'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { stringify } from 'yaml'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { HarnessRuntime } from '../../src/main/runtime/harness-runtime'

function requiredEnv(name: string): string {
  const value = process.env[name]
  assert.ok(value, 'Missing environment variable: ' + name)
  return value
}
const root = requiredEnv('CODELY_AGENT_PROBE_ROOT')
const output = requiredEnv('CODELY_AGENT_PROBE_OUTPUT')
const executable = requiredEnv('GODOT_TEST_BIN')
const model = requiredEnv('ANTHROPIC_MODEL')
const home = join(root, 'harness')
const project = join(root, 'game')
app.setPath('userData', join(root, 'electron'))
app.on('window-all-closed', () => {})
let runtime: HarnessRuntime | undefined
let window: BrowserWindow | undefined
let sessionId: string | undefined
const delay = (ms: number) => new Promise(done => setTimeout(done, ms))
const hash = (content: string) => createHash('sha256').update(content).digest('hex')
const baseline = 'extends Node2D\nconst SPEED = 100\nfunc _ready():\n\tprint("CODELY_SPEED=", SPEED)\n'
const snapshots: Record<string, { sha256: string, content: string }> = {}
const checks: unknown[] = []

// Use authenticated renderer RPCs from the locked Harness API, exactly as its client does.
async function rpc(endpoint: string, args: unknown): Promise<unknown> {
  assert.ok(window)
  return window.webContents.executeJavaScript(`(async()=>{const r=await fetch('/api/'+${JSON.stringify(endpoint)},{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method:${JSON.stringify(endpoint)},payload:{args:${JSON.stringify(args)}}})});if(!r.ok)throw Error('RPC HTTP '+r.status);const v=await r.json();if(!v.result?.ok)throw Error(JSON.stringify(v.result));return v.result.value})()`)
}
async function saveEvidence(filename: string, value: unknown): Promise<void> {
  let text = JSON.stringify(value, null, 2)
  const secret = process.env.ANTHROPIC_AUTH_TOKEN
  if (secret) text = text.replaceAll(secret, '<redacted>')
  await writeFile(join(output, filename), text)
}
async function capture(label: string): Promise<{ sha256: string, content: string }> {
  const content = await readFile(join(project, 'main.gd'), 'utf8')
  const snapshot = { sha256: hash(content), content }
  snapshots[label] = snapshot
  await saveEvidence('files.json', snapshots)
  return snapshot
}
async function verify(label: string, expected: boolean): Promise<void> {
  assert.ok(executable)
  const args = ['--headless', '--path', project, '--script', 'main.gd', '--check-only']
  const result = await new Promise<{ code: number | null, log: string }>((done, reject) => {
    const child = spawn(executable, args, { windowsHide: true, env: { ...process.env, APPDATA: join(root, 'godot-user'), LOCALAPPDATA: join(root, 'godot-local') } })
    let log = ''
    const timer = setTimeout(() => { child.kill(); reject(Error('Godot validation timed out; side effects must be inspected')) }, 30000)
    child.stdout.on('data', chunk => { log += chunk })
    child.stderr.on('data', chunk => { log += chunk })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); done({ code, log }) })
  })
  await writeFile(join(output, label + '.log'), result.log)
  const passed = result.code === 0 && !/SCRIPT ERROR|Parse Error/.test(result.log)
  checks.push({ label, args, code: result.code, passed, inputSha256: snapshots[label]?.sha256 })
  assert.equal(passed, expected, result.log)
}
async function journal(): Promise<SessionEvent[]> {
  const projection = await rpc('session/projections', { request: { sessionId } }) as { asOfSeq: number }
  const page = await rpc('session/page', { request: { address: { kind: 'session', sessionId }, throughSeq: projection.asOfSeq, beforeSeq: projection.asOfSeq + 1, maxMessages: 200 } }) as { records: { type: string, event?: SessionEvent }[], hasMore: boolean }
  assert.equal(page.hasMore, false, 'Acceptance journal must fit in one complete page')
  return page.records.flatMap(record => record.type === 'event' && record.event ? [record.event] : [])
}
async function prompt(text: string, label: string): Promise<void> {
  const previous = await journal()
  const lastSeq = Math.max(-1, ...previous.map(event => Number(event.seq)))
  await writeFile(join(output, label + '-prompt.txt'), text)
  await rpc('session/prompt', { request: { requestId: randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text }], clientTimeZone: 'Asia/Shanghai' } })
  console.log(label + ': prompt accepted')
  const deadline = Date.now() + 240000
  while (Date.now() < deadline) {
    const events = await journal()
    await saveEvidence('journal.json', events)
    const suffix = events.filter(event => Number(event.seq) > lastSeq)
    const end = suffix.find(event => event.type === 'turn/end')
    if (end) {
      console.log(label + ': turn ended ' + JSON.stringify(end))
      assert.equal(end.data.reason.kind, 'completed', 'Model turn must finish successfully')
      const calls = suffix.filter(event => event.type === 'tool/call')
      assert.ok(calls.every(event => event.data.name.startsWith('mcp__godot__') || ['glob', 'grep', 'read'].includes(event.data.name)), 'Unexpected tool entry outside scoped MCP/read-only acceptance')
      const verifies = calls.filter(event => event.data.name.endsWith('__project') && JSON.parse(event.data.arguments).action === 'verify')
      assert.ok(verifies.length >= (label === 'repair' ? 2 : 1), 'Model must invoke real Godot verification before/after repair')
      const results = suffix.filter(event => event.type === 'tool/result' && verifies.some(call => call.data.callId === event.data.message.toolCallId))
      assert.ok(results.length >= verifies.length, 'Verification tool calls need recorded results')
      if (label === 'repair') assert.ok(results.some(event => event.type === 'tool/result' && event.data.message.isError), 'Agent must observe the injected compile error')
      assert.ok(results.some(event => event.type === 'tool/result' && !event.data.message.isError), 'Agent must observe a successful Godot verification')
      const expectedVersion = (await readFile(join(output, 'baseline.log'), 'utf8')).match(/Godot Engine v([^\s]+)/)?.[1]
      assert.ok(expectedVersion, 'Independent Godot version must be captured')
      assert.ok(results.every(event => JSON.stringify(event.data).includes(expectedVersion)), 'MCP and independent checks must use the same Godot version')
      return
    }
    await delay(1500)
  }
  await rpc('session/cancel', { request: { sessionId } })
  throw Error('Model turn timed out; cancelled, inspect journal and files before any retry')
}
async function main(): Promise<void> {
  await app.whenReady()
  for (const path of [home, project, join(root, 'neutral')]) await mkdir(path, { recursive: true })
  await writeFile(join(project, 'project.godot'), 'config_version=5\n[application]\nconfig/name="Codely real agent acceptance"\nrun/main_scene="res://main.tscn"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n')
  await writeFile(join(project, 'main.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://main.gd" id="1"]\n[node name="Main" type="Node2D"]\nscript=ExtResource("1")\n')
  await writeFile(join(project, 'main.gd'), baseline)
  const frozen = new Map(await Promise.all(['project.godot', 'main.tscn'].map(async name => [name, hash(await readFile(join(project, name), 'utf8'))] as const)))
  // MCP starts during plugin activation and caches its engine selection.
  await mkdir(join(home, '.godot'), { recursive: true })
  await writeFile(join(home, '.godot', 'godot-path.txt'), executable + '\n')
  // The overlay contains only an environment credential reference. No user Profile is copied.
  const overlay = join(root, 'desktop.patch.yml')
  await writeFile(overlay, await readFile(resolve('build/dsh-desktop.patch.yml'), 'utf8') + '\n' + stringify([
    { id: 'llm-pi-ai', config: { providers: { 'acceptance-model': { api: 'anthropic-messages', baseURL: process.env.ANTHROPIC_BASE_URL, apiKeyEnv: 'ANTHROPIC_AUTH_TOKEN', models: [{ id: model, name: model, input: ['text'], reasoning: false, contextWindow: 131072, maxTokens: 4096 }] } } } },
    { id: 'agent-default-model', config: { provider: 'acceptance-model', model } }
  ]))
  runtime = new HarnessRuntime({ dshEntryPath: resolve('node_modules/@deepseek-ai/dsh/lib/bin.js'), nodeEntryPath: resolve('build/harness-node-entry.mjs'), nodeExecutablePath: process.execPath, dshPatchPath: overlay, dshSafePatchPath: resolve('build/dsh-desktop-safe.patch.yml'), dshHome: home, logPath: join(root, 'harness.log'), preferredPort: 0, startupTimeoutMs: 180000,
    launchProcess: (file, args, options) => spawn(file, args, { ...options, env: { ...options.env, ELECTRON_RUN_AS_NODE: '1', GODOT_PATH: executable, GODOT_CODELY_BRIDGE_PORT: '0', GODOT_CODELY_MEMORY_DIR: join(root, 'memories') } }), onChanged() {} })
  await runtime.start(join(root, 'neutral'))
  const snapshot = runtime.snapshot()
  assert.equal(snapshot.phase, 'ready', snapshot.logs.join('\n'))
  assert.ok(snapshot.url && snapshot.authToken)
  window = new BrowserWindow({ width: 1280, height: 800, show: false, webPreferences: { preload: resolve('out/preload/index.cjs'), sandbox: true, contextIsolation: true, backgroundThrottling: false } })
  ipcMain.on('dsh:storage-load-sync', event => { event.returnValue = {} })
  ipcMain.on('dsh:storage-sync', () => {})
  ipcMain.handle('updates:status', () => ({ phase: 'idle', currentVersion: 'test', manual: false }))
  ipcMain.handle('mobile:status', () => ({ connected: false }))
  ipcMain.handle('harness:renderer-healthy', () => ({ ok: true }))
  ipcMain.handle('desktop-titlebar:set-theme', () => {})
  ipcMain.handle('safe-mode:status', () => ({ visible: false }))
  await window.loadURL(snapshot.url + '?token=' + encodeURIComponent(snapshot.authToken))
  const created = await rpc('workspace/create', { request: { path: project } }) as { workspace: { workspaceId: string } }
  const workspaceId = created.workspace.workspaceId
  const session = await window.webContents.executeJavaScript(`fetch('/api/godot-desktop/session?workspaceId='+${JSON.stringify(workspaceId)},{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(r=>r.json())`) as { sessionId: string }
  sessionId = session.sessionId
  assert.ok(sessionId)
  await rpc('session/selectModel', { request: { sessionId, provider: 'acceptance-model', model } })
  await capture('baseline'); await verify('baseline', true)
  const boundary = `仅在隔离测试工程 ${project} 内工作。先调用 Godot config(action=set,key=project_path,value=${JSON.stringify(project)})，再 config(action=set,key=godot_path,value=${JSON.stringify(executable)})，status 确认；不调用 auto_setup 或自动发现。读取 main.gd 后再写。优先使用 Godot MCP 工具；允许本工程内只读文件查询。只修改 main.gd，禁止 shell、子代理、联网、导出或操作其他工程。不需要询问确认。`
  await prompt(boundary + '把 SPEED 从 100 改为 240，保留打印逻辑。用 project.verify 实际验证，报告原始结果，不自行宣称真人体验通过。', 'change')
  const changed = await capture('changed')
  assert.match(changed.content, /SPEED\s*(?::\s*\w+\s*)?=\s*240/)
  await verify('changed', true)
  await writeFile(join(project, 'main.gd'), changed.content + '\nfunc intentional_error(:\n')
  await capture('broken'); await verify('broken', false)
  await prompt(boundary + '验收人员刚在 main.gd 末尾插入一处语法错误。先调用 project.verify 读取真实错误，再读取脚本并只修复该错误，保留 SPEED=240，最后再次 project.verify，区分自动验证和真人验收。', 'repair')
  const repaired = await capture('repaired'); await verify('repaired', true)
  assert.match(repaired.content, /SPEED\s*(?::\s*\w+\s*)?=\s*240/)
  for (const [name, sha256] of frozen) assert.equal(hash(await readFile(join(project, name), 'utf8')), sha256, name + ' must remain unchanged')
  const events = await journal()
  await saveEvidence('journal.json', events)
  await saveEvidence('result.json', { status: 'passed', model, provider: 'acceptance-model', realModel: true, workspaceId, sessionId, checks, limitation: 'Development Harness/Electron with existing preload; not an installed candidate or human UX/FUN acceptance' })
  await writeFile(join(output, 'desktop.png'), (await window.webContents.capturePage()).toPNG())
  console.log('Real model desktop acceptance passed')
}
main().then(() => cleanup(0), async error => {
  console.error(String(error))
  await capture('failure').catch(error => console.error('Unable to capture fixture:', String(error)))
  await saveEvidence('result.json', { status: 'failed', error: String(error), model, checks })
  await cleanup(1)
})
async function cleanup(code: number): Promise<void> {
  if (code && sessionId && window) await rpc('session/cancel', { request: { sessionId } }).catch(error => console.error('Cancel failed; stopping owned Harness:', String(error)))
  window?.destroy()
  await runtime?.stop()
  app.exit(code)
}
