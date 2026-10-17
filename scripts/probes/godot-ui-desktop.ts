/** Real renderer/session recovery with an intentionally unconfigured, loopback-only model. */
import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { stringify } from 'yaml'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { HarnessRuntime } from '../../src/main/runtime/harness-runtime'
import { DesktopStorageManager, type DesktopStorageAction } from '../../src/main/state/desktop-storage'

function requiredEnv(name: string): string {
  const value = process.env[name]
  assert.ok(value, 'Missing ' + name)
  return value
}
const root = requiredEnv('CODELY_AGENT_PROBE_ROOT')
const output = requiredEnv('CODELY_AGENT_PROBE_OUTPUT')
const home = join(root, 'harness')
const project = join(root, '隔离工程-长路径-用于真实桌面恢复验收')
const marker = 'R0-UI-RECOVERY-PROMPT'
const draft = '尚未发送的草稿 R0-DRAFT：保留跳跃逻辑，只检查错误。'
app.setPath('userData', join(root, 'electron'))
app.on('window-all-closed', () => {})
let runtime: HarnessRuntime | undefined
let window: BrowserWindow | undefined
let storage: DesktopStorageManager | undefined
let workspaceId: string | undefined
let sessionId: string | undefined
const checks: unknown[] = []
const delay = (ms: number) => new Promise(done => setTimeout(done, ms))
async function until(check: () => Promise<boolean>, label: string, timeout = 30000): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { if (await check()) return; await delay(250) }
  throw Error('Timed out: ' + label)
}
async function evaluate<T>(expression: string): Promise<T> {
  assert.ok(window)
  return window.webContents.executeJavaScript(expression)
}
async function rpc<T>(endpoint: string, args: unknown): Promise<T> {
  return evaluate(`(async()=>{const r=await fetch('/api/'+${JSON.stringify(endpoint)},{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method:${JSON.stringify(endpoint)},payload:{args:${JSON.stringify(args)}}})});const v=await r.json();if(!r.ok||!v.result?.ok)throw Error(JSON.stringify(v.result));return v.result.value})()`)
}
async function journal(): Promise<SessionEvent[]> {
  const p = await rpc<{ asOfSeq: number }>('session/projections', { request: { sessionId } })
  const page = await rpc<{ records: { type: string, event?: SessionEvent }[], hasMore: boolean }>('session/page', { request: { address: { kind: 'session', sessionId }, throughSeq: p.asOfSeq, beforeSeq: p.asOfSeq + 1, maxMessages: 200 } })
  assert.equal(page.hasMore, false)
  return page.records.flatMap(record => record.event ? [record.event] : [])
}
async function openSession(): Promise<void> {
  await until(() => evaluate(`(()=>{const r=document.querySelector('[data-row-key="workspace:${workspaceId}"]');if(!r)return false;if(r.getAttribute('aria-expanded')!=='true')r.click();return true})()`), 'project tree')
  await until(() => evaluate(`(()=>{const r=document.querySelector('[data-row-key="session:${sessionId}"]');if(!r)return false;r.click();return true})()`), 'native session row')
  await until(() => evaluate(`document.body.innerText.includes(${JSON.stringify(marker)}) && !!document.querySelector('[contenteditable="true"],textarea')`), 'native chat replay')
}
async function draftText(): Promise<string> {
  return evaluate(`(()=>{const e=document.querySelector('[contenteditable="true"],textarea');return e?.value??e?.innerText??''})()`)
}
async function capture(label: string): Promise<void> {
  assert.ok(window)
  window.showInactive()
  await delay(500)
  await writeFile(join(output, label + '.png'), (await window.webContents.capturePage()).toPNG())
  window.hide()
  const view = await evaluate<{ width: number, height: number, scrollWidth: number }>(`({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,body:document.body.innerText,theme:document.documentElement.dataset,background:getComputedStyle(document.body).backgroundColor,composer:[...document.querySelectorAll('[contenteditable="true"],textarea')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,editable:e.isContentEditable,value:e.value??e.innerText}})})`)
  await writeFile(join(output, label + '.json'), JSON.stringify(view, null, 2))
  assert.ok(view.scrollWidth <= view.width, 'No document-level horizontal overflow: ' + label)
}
async function start(): Promise<void> {
  assert.ok(runtime)
  storage = new DesktopStorageManager(join(home, 'profiles', 'web'), { onError: error => { throw error } })
  await runtime.start(join(root, 'neutral'))
  const s = runtime.snapshot()
  assert.equal(s.phase, 'ready', s.logs.join('\n'))
  assert.ok(s.url && s.authToken)
  window = new BrowserWindow({ width: 1280, height: 800, show: false, webPreferences: { preload: resolve('out/preload/index.cjs'), sandbox: true, contextIsolation: true, backgroundThrottling: false } })
  await window.loadURL(s.url + '?token=' + encodeURIComponent(s.authToken))
}
async function main(): Promise<void> {
  await app.whenReady()
  for (const path of [home, project, join(root, 'neutral')]) await mkdir(path, { recursive: true })
  await writeFile(join(project, 'project.godot'), 'config_version=5\n[application]\nconfig/name="隔离恢复工程"\n')
  const overlay = join(root, 'desktop.patch.yml')
  await writeFile(overlay, await readFile(resolve('build/dsh-desktop.patch.yml'), 'utf8') + '\n' + stringify([
    { id: 'llm-pi-ai', config: { providers: { 'ui-unconfigured': { api: 'anthropic-messages', baseURL: 'http://127.0.0.1:1', apiKeyEnv: 'CODELY_UNCONFIGURED_KEY', models: [{ id: 'missing-credential', input: ['text'], reasoning: false }] } } } },
    { id: 'agent-default-model', config: { provider: 'ui-unconfigured', model: 'missing-credential' } }
  ]))
  runtime = new HarnessRuntime({ dshEntryPath: resolve('node_modules/@deepseek-ai/dsh/lib/bin.js'), nodeEntryPath: resolve('build/harness-node-entry.mjs'), nodeExecutablePath: process.execPath, dshPatchPath: overlay, dshSafePatchPath: resolve('build/dsh-desktop-safe.patch.yml'), dshHome: home, logPath: join(root, 'harness.log'), preferredPort: 0, startupTimeoutMs: 180000,
    launchProcess: (file, args, options) => spawn(file, args, { ...options, env: { ...options.env, ELECTRON_RUN_AS_NODE: '1', GODOT_CODELY_BRIDGE_PORT: '0', GODOT_CODELY_MEMORY_DIR: join(root, 'memories') } }), onChanged() {} })
  ipcMain.on('dsh:storage-load-sync', event => { event.returnValue = storage?.getAll() ?? {} })
  ipcMain.on('dsh:storage-sync', (_event, action: DesktopStorageAction) => storage?.applyAction(action))
  for (const [channel, result] of Object.entries({ 'updates:status': { phase: 'idle', currentVersion: 'test', manual: false }, 'mobile:status': { connected: false }, 'harness:renderer-healthy': { ok: true }, 'safe-mode:status': { visible: false }, 'desktop-titlebar:set-theme': {} })) ipcMain.handle(channel, () => result)
  await start()
  const created = await rpc<{ workspace: { workspaceId: string } }>('workspace/create', { request: { path: project } })
  workspaceId = created.workspace.workspaceId
  const session = await evaluate<{ sessionId: string }>(`fetch('/api/godot-desktop/session?workspaceId='+${JSON.stringify(workspaceId)},{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(r=>r.json())`)
  sessionId = session.sessionId
  assert.ok(sessionId)
  await rpc('session/prompt', { request: { sessionId, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text: marker }], clientTimeZone: 'Asia/Shanghai' } })
  await until(async () => (await journal()).some(event => event.type === 'turn/end'), 'missing-model failure')
  const before = await journal()
  assert.ok(before.some(event => event.type === 'turn/end' && event.data.reason.kind === 'error'), 'Missing model must fail explicitly')
  await rpc('session/rename', { request: { sessionId, title: 'R0 UI recovery' } })
  await openSession()
  await evaluate(`document.querySelector('[contenteditable="true"],textarea').focus()`)
  assert.ok(window)
  await window.webContents.insertText(draft)
  await until(async () => (await draftText()).includes(draft), 'typed draft')
  for (const width of [1280, 900]) {
    window.setSize(width, 800)
    for (const theme of ['dark', 'light'] as const) {
      nativeTheme.themeSource = theme
      await capture(width + '-' + theme)
      assert.ok((await draftText()).includes(draft), 'Resize/theme must retain input')
    }
  }
  checks.push({ stage: 'native-chat', missingModelError: true, sizes: [1280, 900], height: 800, systemThemeRequests: ['dark', 'light'], draftRetained: true })
  await rpc('settings/update', { ns: 'locale', patch: { preference: 'en' } })
  await until(() => evaluate(`document.body.innerText.includes('This turn failed') && document.body.innerText.includes('Workspace Write')`), 'English locale')
  await capture('900-english')
  await evaluate(`document.querySelector('[contenteditable="true"],textarea').focus()`)
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' })
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' })
  const keyboardFocus = await evaluate<{ tag: string, editable: boolean, label: string | null }>(`({tag:document.activeElement?.tagName,editable:document.activeElement?.isContentEditable,label:document.activeElement?.getAttribute('aria-label')})`)
  assert.equal(keyboardFocus.editable, false, 'Tab must move focus out of composer')
  assert.ok((await draftText()).includes(draft), 'Language switch and Tab must retain input')
  checks.push({ stage: 'english-keyboard', locale: 'en', keyboardFocus, draftRetained: true })
  storage?.flushSync()
  window.destroy(); window = undefined
  await runtime.stop()
  await start()
  const after = await journal()
  assert.deepEqual(after.filter(event => ['user/message', 'turn/end'].includes(event.type)), before.filter(event => ['user/message', 'turn/end'].includes(event.type)), 'Committed session/error must survive Harness restart')
  await openSession()
  const restored = await draftText()
  await capture('reopened')
  checks.push({ stage: 'reopened', sameSessionId: sessionId, sameWorkspaceId: workspaceId, journalRestored: true, draftRestored: restored.includes(draft) })
  await writeFile(join(output, 'journal.json'), JSON.stringify(after, null, 2))
  assert.ok(restored.includes(draft), 'Unsent draft must restore after closing renderer and restarting Harness')
  await writeFile(join(output, 'result.json'), JSON.stringify({ status: 'passed', checks, limitations: ['development harness, existing preload', 'Electron main not restarted', 'effective themes require screenshot review', 'human UX and workbench switching not tested'] }, null, 2))
  console.log('Native chat, missing-model error, resizing and session/draft recovery passed')
}
main().then(() => cleanup(0), async error => {
  console.error(String(error))
  if (window && !window.isDestroyed()) await capture('failure').catch(captureError => console.error(String(captureError)))
  await writeFile(join(output, 'result.json'), JSON.stringify({ status: 'failed', error: String(error), checks }, null, 2))
  await cleanup(1)
})
async function cleanup(code: number): Promise<void> {
  storage?.flushSync()
  window?.destroy()
  await runtime?.stop()
  app.exit(code)
}
