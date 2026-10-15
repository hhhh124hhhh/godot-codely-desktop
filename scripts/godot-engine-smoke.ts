import { app, BrowserWindow, ipcMain } from 'electron'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { HarnessRuntime } from '../src/main/runtime/harness-runtime'
import { GodotEngineService } from '../src/main/godot-engine'
import { createGodotEngineHandler } from '../src/main/godot-engine-ipc'
import type { GodotEngineResult, GodotEngineState } from '../src/shared/godot-engine'

const root = process.env.GODOT_ENGINE_SMOKE_ROOT
const output = process.env.GODOT_ENGINE_SMOKE_OUTPUT
const executable = process.env.GODOT_TEST_BIN
if (!root || !output || !executable) throw Error('Run via scripts/run-godot-engine-smoke.mjs')
app.setPath('userData', join(root, 'electron'))
app.on('window-all-closed', () => {})
const delay = (ms: number) => new Promise(resolveDelay => setTimeout(resolveDelay, ms))
async function until(check: () => Promise<boolean>, label: string, timeout = 30000): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { if (await check()) return; await delay(150) }
  throw Error('Timed out: ' + label)
}
let runtime: HarnessRuntime | undefined
let service: GodotEngineService | undefined
let window: BrowserWindow | undefined
let otherWindow: BrowserWindow | undefined
const editors: ChildProcess[] = []

async function main(): Promise<void> {
  await app.whenReady()
  const home = join(root, 'harness')
  const project = join(root, 'game')
  await mkdir(project, { recursive: true })
  await mkdir(join(root, 'neutral'), { recursive: true })
  await writeFile(join(project, 'project.godot'), 'config_version=5\n[application]\nconfig/name="Godot native acceptance"\nrun/main_scene="res://main.tscn"\n[display]\nwindow/size/viewport_width=320\nwindow/size/viewport_height=180\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n')
  await writeFile(join(project, 'main.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://main.gd" id="1"]\n[node name="Main" type="Node2D"]\nscript=ExtResource("1")\n')
  await writeFile(join(project, 'main.gd'), 'extends Node2D\nfunc _ready():\n\tprint("NATIVE_GAME_READY")\n')
  runtime = new HarnessRuntime({
    dshEntryPath: resolve('node_modules/@deepseek-ai/dsh/lib/bin.js'), nodeEntryPath: resolve('build/harness-node-entry.mjs'),
    nodeExecutablePath: process.execPath, dshPatchPath: resolve('build/dsh-desktop.patch.yml'), dshSafePatchPath: resolve('build/dsh-desktop-safe.patch.yml'),
    dshHome: home, logPath: join(root, 'harness.log'), preferredPort: 0, startupTimeoutMs: 180000,
    launchProcess: (file, args, options) => spawn(file, args, { ...options, env: { ...options.env, ELECTRON_RUN_AS_NODE: '1', GODOT_CODELY_BRIDGE_PORT: '0' } }), onChanged() {}
  })
  await runtime.start(join(root, 'neutral'))
  const snapshot = runtime.snapshot()
  assert.equal(snapshot.phase, 'ready', snapshot.logs.join('\n'))
  assert.ok(snapshot.url && snapshot.authToken)
  const preload = resolve('out/preload/index.cjs')
  window = new BrowserWindow({ width: 1280, height: 900, show: false, webPreferences: { preload, sandbox: true, contextIsolation: true } })
  const headless = process.env.GODOT_ENGINE_SMOKE_HEADLESS === '1'
  const godotEnvironment = { ...process.env }
  for (const key of ['APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOME']) {
    godotEnvironment[key] = join(root, key.toLowerCase())
    await mkdir(godotEnvironment[key], { recursive: true })
  }
  service = new GodotEngineService(join(home, '.godot', 'godot-path.txt'), '', (file, args, options) => {
    const child = spawn(file, [...(headless ? ['--headless'] : []), ...args], { ...options, env: godotEnvironment })
    if (args.includes('--editor')) editors.push(child)
    return child
  })
  let available = true
  ipcMain.handle('godot-engine:command', createGodotEngineHandler({
    service, window: () => window, endpoint: () => available ? snapshot.url : undefined, pickExecutable: async () => executable
  }))
  // Auxiliary preload seams are inert in this isolated acceptance app.
  ipcMain.on('dsh:storage-load-sync', event => { event.returnValue = {} })
  ipcMain.on('dsh:storage-sync', () => {})
  ipcMain.handle('updates:status', () => ({ phase: 'idle', currentVersion: 'test', manual: false }))
  ipcMain.handle('mobile:status', () => ({ connected: false }))
  ipcMain.handle('harness:renderer-healthy', () => ({ ok: true }))
  ipcMain.handle('desktop-titlebar:set-theme', () => {})
  ipcMain.handle('safe-mode:status', () => ({ visible: false }))
  await window.loadURL(snapshot.url + '?token=' + encodeURIComponent(snapshot.authToken))
  await until(async () => !!await window?.webContents.executeJavaScript('!!window.__GODOT_DESKTOP_ENGINE__'), 'preload bridge')
  const call = async (method: string, id?: string): Promise<GodotEngineResult> => window?.webContents.executeJavaScript(`window.__GODOT_DESKTOP_ENGINE__[${JSON.stringify(method)}](${id ? JSON.stringify(id) : ''})`)
  const state = async (id?: string): Promise<GodotEngineState> => {
    const result = await call('status', id)
    assert.equal(result.ok, true, JSON.stringify(result))
    if (!result.ok) throw Error(result.code)
    return result.state
  }
  // Use the existing Typert protocol from the authenticated renderer, not an arbitrary local path IPC.
  const created = await window.webContents.executeJavaScript(`fetch('/api/workspace/create', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method:'workspace/create',payload:{args:{request:{path:${JSON.stringify(project)}}}}})}).then(r=>r.json()).then(r=>{if(!r.result?.ok)throw Error(JSON.stringify(r));return r.result.value})`)
  assert.ok(created.workspace?.workspaceId, JSON.stringify(created))
  const id: string = created.workspace.workspaceId
  const session = await window.webContents.executeJavaScript(`fetch('/api/godot-desktop/session?workspaceId='+encodeURIComponent(${JSON.stringify(id)}),{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(r=>r.json())`)
  assert.equal(typeof session.sessionId, 'string')
  const workbenchId = 'hhhh124hhhh/godot-codely-desktop'
  await window.webContents.executeJavaScript(`(async()=>{const old=await (await fetch('/api/desktop-workbenches/state')).json(); old.state.added=[${JSON.stringify(workbenchId)}];old.state.pinned=[${JSON.stringify(workbenchId)}];old.state.active=${JSON.stringify(workbenchId)};old.state.sessionBindings[${JSON.stringify(session.sessionId)}]=${JSON.stringify(workbenchId)};old.state.recentSessions[${JSON.stringify(workbenchId)}]=${JSON.stringify(session.sessionId)}; const r=await fetch('/api/desktop-workbenches/state/write',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(old)});if(!r.ok)throw Error(await r.text())})()`)
  await new Promise<void>(resolveLoad => { window?.webContents.once('did-finish-load', () => resolveLoad()); window?.reload() })
  await until(async () => !!await window?.webContents.executeJavaScript(`(()=>{const b=document.querySelector('.dshWbWorkbenchHome');if(!b)return false;b.click();return true})()`), 'workbench home')
  await until(async () => !!await window?.webContents.executeJavaScript(`(()=>{const b=document.querySelector('#dsh-workbench-mine-tab');if(!b)return false;b.click();return true})()`), 'installed workbenches')
  await until(async () => !!await window?.webContents.executeJavaScript(`(()=>{const tab=document.querySelector('#dsh-workbench-mine-tab');if(tab?.getAttribute('aria-selected')!=='true'){tab?.click();return false}const card=[...document.querySelectorAll('.dshWbCard')].find(x=>x.textContent.includes('Godot'));const b=card?.querySelector('.dshWbRunSwitch');if(!b||b.disabled)return false;if(b.getAttribute('aria-checked')!=='true')b.click();return true})()`), 'enable Godot workbench')
  await until(async () => !!await window?.webContents.executeJavaScript(`(()=>{const b=document.querySelector('.dshWbModeSwitch');if(!b||b.disabled)return false;b.click();return true})()`), 'workbench switcher')
  await until(async () => !!await window?.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('.dshWbModeOption')].find(x=>x.textContent.includes('Godot'));if(!b||b.disabled)return false;b.click();return true})()`), 'activate Godot workbench')
  await until(async () => !!await window?.webContents.executeJavaScript(`document.querySelector('.gcDesktop')?.getClientRects().length`), 'visible Godot workbench')
  await until(async () => !!await window?.webContents.executeJavaScript(`document.querySelector('.gcAside')?.textContent.includes('res://main.tscn')`), 'selected real project')
  await until(async () => (await state(id)).path === null, 'initial engine status')
  const click = async (...labels: string[]): Promise<void> => {
    await until(async () => !!await window?.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('.gcAside button')].find(x=>${JSON.stringify(labels)}.includes(x.textContent));if(!b||b.disabled)return false;b.click();return true})()`), labels.join('/'))
  }
  await click('Choose engine', '选择引擎')
  await until(async () => !!(await state(id)).path, 'saved engine path')
  await click('Run game independently', '独立运行游戏')
  await until(async () => (await state(id)).logs.includes('NATIVE_GAME_READY'), 'real game stdout')
  assert.equal((await call('run', id)).ok, false, 'duplicate run must be rejected')
  await window.webContents.executeJavaScript(`(()=>{const log=document.querySelector('.gcEngineLogs');const details=log?.closest('details');if(details&&!details.open)details.querySelector('summary')?.click();log?.scrollIntoView({block:'center'})})()`)
  await until(async () => !!await window?.webContents.executeJavaScript(`(()=>{const log=document.querySelector('.gcEngineLogs');return log?.getClientRects().length&&log.textContent.includes('NATIVE_GAME_READY')})()`), 'visible native logs')
  await writeFile(join(output, 'workbench.png'), (await window.webContents.capturePage()).toPNG())
  await click('Stop independent game', '停止独立运行')
  await until(async () => !(await state(id)).running, 'stopped game')
  assert.ok((await state(id)).logs.includes('NATIVE_GAME_READY'), 'logs survive stop')
  assert.equal((await call('run', 'missing-workspace')).ok, false)
  available = false
  assert.deepEqual(await call('run', id), { ok: false, code: 'ENGINE_UNAVAILABLE' })
  available = true
  otherWindow = new BrowserWindow({ show: false, webPreferences: { preload, sandbox: true, contextIsolation: true } })
  await otherWindow.loadURL(snapshot.url)
  assert.deepEqual(await otherWindow.webContents.executeJavaScript('window.__GODOT_DESKTOP_ENGINE__.status()'), { ok: false, code: 'ENGINE_UNAVAILABLE' })
  otherWindow.destroy(); otherWindow = undefined
  await click('Open Godot', '打开 Godot')
  await until(async () => (await state(id)).editorRunning, 'real editor process')
  assert.ok(editors.some(child => child.pid && child.exitCode === null), 'editor belongs to this acceptance process')
  assert.equal((await call('run', id)).ok, true)
  await service.dispose()
  assert.equal((await state(id)).running, false, 'quit stops owned game')
  assert.equal((await state(id)).editorRunning, true, 'quit preserves editor')
  await window.loadURL('data:text/html,Untrusted origin')
  assert.deepEqual(await window.webContents.executeJavaScript('window.__GODOT_DESKTOP_ENGINE__.status()'), { ok: false, code: 'ENGINE_UNAVAILABLE' })
  await writeFile(join(output, 'result.json'), JSON.stringify({ status: 'passed', platform: process.platform, headless, isolatedGodotUserDirectories: true, checks: ['authenticated-workspace', 'native-preload', 'choose-save', 'real-run-stdout', 'visible-logs', 'duplicate-rejection', 'stop-retains-logs', 'unknown-workspace', 'safe-mode-denial', 'other-window-denial', 'real-editor', 'quit-ownership', 'origin-denial'], picker: 'test-selected executable; native dialog interaction not automated' }, null, 2))
  console.log('Godot engine native acceptance passed')
}
main().then(() => cleanup(0)).catch(async error => {
  console.error(error)
  if (window && !window.isDestroyed()) {
    console.error(await window.webContents.executeJavaScript('document.querySelector(".gcAside")?.textContent'))
    console.error(await window.webContents.executeJavaScript('JSON.stringify([...document.querySelectorAll(".gcHeader select option")].map(x=>({text:x.textContent,value:x.value})))'))
    console.error(await window.webContents.executeJavaScript('[...document.querySelectorAll(".dshWbCard")].filter(x=>x.textContent.includes("Godot")).map(x=>x.textContent).join("\\n")'))
    await writeFile(join(output, 'failure.png'), (await window.webContents.capturePage()).toPNG())
  }
  return cleanup(1)
})
async function cleanup(code: number): Promise<void> {
  try {
    await service?.dispose()
    for (const child of editors) {
      // Retain actual child handles rather than rediscovering or accepting arbitrary PIDs.
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise<void>(resolveExit => {
          const timeout = setTimeout(resolveExit, 5000)
          child.once('exit', () => { clearTimeout(timeout); resolveExit() })
          child.kill()
        })
      }
    }
    otherWindow?.destroy(); window?.destroy()
    await runtime?.stop()
  } finally { app.exit(code) }
}
