import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { HarnessRuntime } from '../../src/main/runtime/harness-runtime'
import { DesktopStorageManager, type DesktopStorageAction } from '../../src/main/state/desktop-storage'

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw Error('Run through governance-record-ui.mjs: missing ' + name)
  return value
}
const root = requiredEnv('CODELY_RECORD_ROOT')
const output = requiredEnv('CODELY_RECORD_OUTPUT')
app.setPath('userData', join(root, 'electron'))
app.on('window-all-closed', () => {})
let runtime: HarnessRuntime | undefined
let window: BrowserWindow | undefined
let storage: DesktopStorageManager | undefined
function currentWindow(): BrowserWindow {
  assert.ok(window)
  return window
}
const checks: string[] = []
const delay = (ms: number) => new Promise(done => setTimeout(done, ms))
async function evaluate<T>(expression: string): Promise<T> {
  assert.ok(window)
  return window.webContents.executeJavaScript(expression)
}
async function until(expression: string, label: string): Promise<void> {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) { if (await evaluate<boolean>(expression)) return; await delay(150) }
  throw Error('Timed out: ' + label)
}
async function start(): Promise<void> {
  assert.ok(runtime)
  storage = new DesktopStorageManager(join(root, 'harness/profiles/web'), { onError: error => { throw error } })
  await runtime.start(join(root, 'neutral'))
  const state = runtime.snapshot()
  assert.equal(state.phase, 'ready', state.logs.join('\n'))
  assert.ok(state.url && state.authToken)
  window = new BrowserWindow({ width: 1280, height: 800, show: false, webPreferences: { preload: resolve('out/preload/index.cjs'), sandbox: true, contextIsolation: true, backgroundThrottling: false } })
  await window.loadURL(state.url + '?token=' + encodeURIComponent(state.authToken))
}
async function openWorkbench(): Promise<void> {
  await until(`(()=>{const b=document.querySelector('.dshWbWorkbenchHome');if(!b)return false;b.click();return true})()`, 'workbench home')
  await until(`(()=>{const b=document.querySelector('#dsh-workbench-mine-tab');if(!b)return false;b.click();return true})()`, 'mine tab')
  await until(`(()=>{const tab=document.querySelector('#dsh-workbench-mine-tab');if(tab?.getAttribute('aria-selected')!=='true'){tab?.click();return false}const card=[...document.querySelectorAll('.dshWbCard')].find(x=>x.textContent.includes('Godot'));const b=card?.querySelector('.dshWbRunSwitch');if(!b||b.disabled)return false;if(b.getAttribute('aria-checked')!=='true')b.click();return true})()`, 'enable workbench')
  await until(`(()=>{const b=document.querySelector('.dshWbModeSwitch');if(!b||b.disabled)return false;b.click();return true})()`, 'switcher')
  await until(`(()=>{const b=[...document.querySelectorAll('.dshWbModeOption')].find(x=>x.textContent.includes('Godot'));if(!b||b.disabled)return false;b.click();return true})()`, 'Godot option')
  await until(`(()=>{const b=document.querySelector('.gcTabs button');if(!b)return false;b.click();return true})()`, 'project overview')
  await until(`!!document.querySelector('.gcRecord input[name="actorName"]:not(:disabled)')`, 'record form')
}
async function fill(name: string, value: string): Promise<void> {
  await evaluate(`(()=>{const e=document.querySelector('.gcRecord [name="'+${JSON.stringify(name)}+'"]');if(!e)throw Error('Missing field');const d=e.closest('details');if(d&&!d.open)d.querySelector('summary').click();const p=e.tagName==='INPUT'?HTMLInputElement.prototype:HTMLTextAreaElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`)
}
async function submit(): Promise<void> {
  await evaluate(`document.querySelector('.gcRecord form').requestSubmit()`)
  await until(`!!document.querySelector('.gcRecord [role="status"]') && !document.querySelector('.gcRecord button[type="submit"]')?.disabled`, 'save settled')
  assert.equal(await evaluate(`document.querySelector('.gcRecord [role="alert"]')?.textContent || ''`), '')
}
async function main(): Promise<void> {
  await app.whenReady()
  const home = join(root, 'harness')
  const project = join(root, 'fixture-game')
  for (const path of [home, project, join(root, 'neutral')]) await mkdir(path, { recursive: true })
  await writeFile(join(project, 'project.godot'), 'config_version=5\n[application]\nconfig/name="Governance UI fixture"\n')
  if (process.env.GODOT_TEST_BIN) {
    await mkdir(join(home, '.godot'), { recursive: true })
    await writeFile(join(home, '.godot/godot-path.txt'), process.env.GODOT_TEST_BIN)
    await writeFile(join(project, 'project.godot'), 'config_version=5\n[application]\nconfig/name="Governance WITNESS fixture"\nrun/main_scene="res://main.tscn"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n')
    await writeFile(join(project, 'main.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://main.gd" id="1"]\n[node name="Main" type="Node"]\nscript=ExtResource("1")\n')
    await writeFile(join(project, 'main.gd'), 'extends Node\nfunc _ready():\n\tprint("WITNESS_UI_READY")\n')
  }
  const gameOnlyHook = join(root, 'game-only.mjs')
  await writeFile(gameOnlyHook, `import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  if (/^(?:dsh-desktop-office|dsh-ppt(?:-composer)?|@deepseek-ai\\/(?:dsh-skill-office|dsh-office-to-pdf|libreoffice-kit(?:-[^/]+)?))(?:\\/|$)/.test(specifier) || /\\/(?:packages|node_modules)\\/(?:dsh-desktop-office|dsh-ppt(?:-composer)?)(?:\\/|$)/.test(specifier)) throw Error('Office/PPT imported in game-only acceptance: ' + specifier);
  return next(specifier, context);
} });`)
  runtime = new HarnessRuntime({ dshEntryPath: resolve('node_modules/@deepseek-ai/dsh/lib/bin.js'), nodeEntryPath: resolve('build/harness-node-entry.mjs'), nodeExecutablePath: process.execPath, dshPatchPath: resolve('build/dsh-desktop.patch.yml'), dshSafePatchPath: resolve('build/dsh-desktop-safe.patch.yml'), dshHome: home, logPath: join(root, 'harness.log'), preferredPort: 0, startupTimeoutMs: 180000,
    launchProcess: (file, args, options) => spawn(file, ['--import', pathToFileURL(gameOnlyHook).href, ...args], { ...options, env: { ...options.env, ELECTRON_RUN_AS_NODE: '1', GODOT_CODELY_BRIDGE_PORT: '0', GODOT_CODELY_MEMORY_DIR: join(root, 'memories'), APPDATA: join(root, 'os-appdata'), LOCALAPPDATA: resolve('.build/governance-record-ui/native-cache'), HOME: join(root, 'os-home'), USERPROFILE: join(root, 'os-user') } }), onChanged() {} })
  ipcMain.on('dsh:storage-load-sync', event => { event.returnValue = storage?.getAll() ?? {} })
  ipcMain.on('dsh:storage-sync', (_event, action: DesktopStorageAction) => storage?.applyAction(action))
  for (const [channel, value] of Object.entries({ 'godot-engine:command': { ok: false, code: 'ENGINE_UNAVAILABLE' }, 'updates:status': { phase: 'idle', currentVersion: 'probe' }, 'mobile:status': {}, 'harness:renderer-healthy': { ok: true }, 'safe-mode:status': { visible: false }, 'desktop-titlebar:set-theme': {} })) ipcMain.handle(channel, () => value)
  await start()
  const id = await evaluate<string>(`fetch('/api/workspace/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method:'workspace/create',payload:{args:{request:{path:${JSON.stringify(project)}}}}})}).then(r=>r.json()).then(r=>r.result.value.workspace.workspaceId)`)
  const session = await evaluate<{ sessionId: string }>(`fetch('/api/godot-desktop/session?workspaceId='+${JSON.stringify(id)},{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(r=>r.json())`)
  const wb = 'hhhh124hhhh/godot-codely-desktop'
  await evaluate(`(async()=>{const old=await(await fetch('/api/desktop-workbenches/state')).json();old.state.added=[${JSON.stringify(wb)}];old.state.pinned=[${JSON.stringify(wb)}];old.state.active=${JSON.stringify(wb)};old.state.sessionBindings[${JSON.stringify(session.sessionId)}]=${JSON.stringify(wb)};old.state.recentSessions[${JSON.stringify(wb)}]=${JSON.stringify(session.sessionId)};const r=await fetch('/api/desktop-workbenches/state/write',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(old)});if(!r.ok)throw Error(await r.text())})()`)
  await currentWindow().loadURL(currentWindow().webContents.getURL())
  await openWorkbench()
  await fill('actorName', 'UI fixture owner')
  await submit()
  await until(`!!document.querySelector('.gcRecord textarea[name="intent"]')`, 'created project')
  const task = { intent: 'Verify handoff recovery', boundary: 'Fixture only', stop: 'Stop on mismatch', progress: 'Recorded through UI', recommendedNextAction: 'Review after restart' }
  for (const [key, value] of Object.entries(task)) await fill(key, value)
  await submit()
  checks.push('UI create and task save')
  const external = await evaluate<{ projectId: string, basisRevision: number }>(`fetch('/api/godot-desktop/handoff?workspaceId='+${JSON.stringify(id)}).then(r=>r.json())`)
  await evaluate(`fetch('/api/godot-desktop/record?workspaceId='+${JSON.stringify(id)},{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(${JSON.stringify({ action: 'task', actorName: 'Other fixture window', projectId: external.projectId, expectedStateRevision: external.basisRevision, task: { ...task, progress: 'Saved by another window' } })})}).then(async r=>{if(!r.ok)throw Error(await r.text())})`)
  await evaluate(`document.querySelector('.gcRecord form').requestSubmit()`)
  await until(`!!document.querySelector('.gcRecord [role="alert"]')`, 'CAS conflict shown')
  assert.equal(await evaluate(`document.querySelector('.gcRecord [name="progress"]').value`), task.progress)
  await evaluate(`document.querySelector('.gcRecord .gcActions button').click()`)
  await until(`!document.querySelector('.gcRecord button[type="submit"]')?.disabled`, 'conflict reload')
  assert.equal(await evaluate(`document.querySelector('.gcRecord [name="progress"]').value`), task.progress)
  await submit()
  checks.push('conflict blocks stale save; reload preserves draft for review')
  const otherProject = join(root, 'second-game')
  await mkdir(otherProject)
  await writeFile(join(otherProject, 'project.godot'), 'config_version=5\n')
  const otherId = await evaluate<string>(`fetch('/api/workspace/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method:'workspace/create',payload:{args:{request:{path:${JSON.stringify(otherProject)}}}}})}).then(r=>r.json()).then(r=>r.result.value.workspace.workspaceId)`)
  const selectProject = (value: string) => evaluate(`(()=>{const e=document.querySelector('.gcHeader select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await until(`!!document.querySelector('.gcHeader option[value="'+${JSON.stringify(otherId)}+'"]')`, 'second workspace discovered')
  await selectProject(otherId)
  await until(`!!document.querySelector('.gcRecord input:not(:disabled)') && !document.querySelector('.gcRecord textarea')`, 'unassigned second project')
  assert.equal(await evaluate(`document.querySelector('.gcRecord input').value`), '')
  await selectProject(id)
  await until(`document.querySelector('.gcRecord [name="intent"]')?.value===${JSON.stringify(task.intent)}`, 'return to recorded project')
  checks.push('project switching isolates records and form state')
  if (process.env.GODOT_TEST_BIN) {
    const fingerprint = async () => createHash('sha256').update(await readFile(join(project, 'main.gd'))).digest('hex')
    const beforeHash = await fingerprint()
    const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('node_modules/dsh-godot-stack/godot-stack/mcp/godot-mcp-server/runtime/build/index.js')], cwd: project,
      env: { PATH: process.env.PATH ?? '', ELECTRON_RUN_AS_NODE: '1', DSH_HOME: home, GODOT_PATH: process.env.GODOT_TEST_BIN, GODOT_CODELY_MEMORY_DIR: join(root, 'memories'), APPDATA: join(root, 'os-appdata'), LOCALAPPDATA: join(root, 'os-godot-cache'), HOME: join(root, 'os-home'), USERPROFILE: join(root, 'os-user') }, stderr: 'pipe' })
    const client = new Client({ name: 'governance-witness-fixture', version: '1' })
    let mcpLog = ''
    transport.stderr?.on('data', data => { mcpLog += String(data) })
    try {
      await client.connect(transport)
      const arguments_ = { action: 'write', script_path: 'res://main.gd', content: 'extends Node\nconst SPEED = 240\nfunc _ready():\n\tprint("WITNESS_UI_READY speed=", SPEED)\n' }
      const result = await client.callTool({ name: 'scripts', arguments: arguments_ })
      assert.notEqual(result.isError, true)
      const afterHash = await fingerprint()
      assert.notEqual(afterHash, beforeHash)
      const binding = await evaluate(`fetch('/api/godot-desktop/handoff?workspaceId='+${JSON.stringify(id)}).then(r=>r.json())`)
      await writeFile(join(output, 'tool-change.json'), JSON.stringify({ binding, name: 'scripts', arguments: arguments_, result, beforeHash, afterHash, limitations: ['Direct real MCP protocol invocation; not a model turn or enforced entry'] }, null, 2))
      checks.push('real bundled MCP script write with before/after hashes and project/task binding')
    } finally { await client.close(); await writeFile(join(output, 'mcp.log'), mcpLog) }
    const checkWitness = async (expected: string): Promise<void> => {
      await until(`(()=>{const b=document.querySelector('.gcHandoff button');if(!b||b.disabled)return false;b.click();return true})()`, 'run WITNESS from workbench')
      await until(`!document.querySelector('.gcHandoff button')?.disabled && document.querySelector('.gcHandoff')?.textContent.includes(${JSON.stringify(expected)})`, 'WITNESS verdict: ' + expected)
    }
    await checkWitness('等待真人确认')
    let report = await evaluate<{ technicalGate: { verdict: string }, taskGate: { verdict: string } }>(`fetch('/api/godot-desktop/witness?workspaceId='+${JSON.stringify(id)}).then(r=>r.json())`)
    assert.equal(report.technicalGate.verdict, 'PASS'); assert.equal(report.taskGate.verdict, 'WAIT_HUMAN')
    assert.ok(JSON.stringify(report).includes('VALIDATION_COMPLETE'), 'Actual Harness must retain the raw Godot compiler output')
    const script = await readFile(join(project, 'main.gd'), 'utf8')
    await writeFile(join(project, 'main.gd'), script + '\nfunc broken(:\n')
    await evaluate(`document.querySelector('.gcRecord .gcActions button').click()`)
    await until(`document.querySelector('.gcHandoff')?.textContent.includes('缺少当前有效证据')`, 'external edit invalidates prior PASS')
    await checkWitness('需要修复')
    await writeFile(join(project, 'main.gd'), script)
    await evaluate(`document.querySelector('.gcRecord .gcActions button').click()`)
    await until(`!document.querySelector('.gcHandoff button')?.disabled`, 'reload repaired input')
    await checkWitness('等待真人确认')
    report = await evaluate(`fetch('/api/godot-desktop/witness?workspaceId='+${JSON.stringify(id)}).then(r=>r.json())`)
    assert.equal(report.technicalGate.verdict, 'PASS')
    await writeFile(join(output, 'witness.json'), JSON.stringify(report, null, 2))
    checks.push('real Godot via UI: PASS/WAIT_HUMAN, external STALE, compile REPAIR, repaired PASS')
  }
  for (const width of [1280, 900]) for (const theme of ['dark', 'light'] as const) {
    currentWindow().setSize(width, 800); nativeTheme.themeSource = theme
    if (width === 900) await evaluate(`(()=>{const b=document.querySelector('.gcHeader button[aria-expanded="true"]');b?.click()})()`)
    currentWindow().showInactive(); await delay(400)
    await writeFile(join(output, `${width}-${theme}.png`), (await currentWindow().webContents.capturePage()).toPNG()); currentWindow().hide()
    assert.ok(await evaluate<boolean>('document.documentElement.scrollWidth<=innerWidth'))
  }
  checks.push('two sizes and theme requests without horizontal overflow')
  await evaluate(`fetch('/api/settings/update',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method:'settings/update',payload:{args:{ns:'locale',patch:{preference:'en'}}}})}).then(async r=>{if(!r.ok)throw Error(await r.text())})`)
  await until(`document.querySelector('.gcRecord')?.textContent.includes('Task goal')`, 'English task labels')
  currentWindow().show(); currentWindow().focus(); currentWindow().webContents.focus()
  await evaluate(`(()=>{const d=document.querySelector('.gcRecord details[data-record-editor]');if(d&&!d.open)d.querySelector('summary').click()})()`)
  await evaluate(`document.querySelector('.gcRecord input').focus()`)
  currentWindow().webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' })
  currentWindow().webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' })
  await until(`document.activeElement?.getAttribute('name')==='intent'`, 'keyboard Tab to goal')
  assert.equal(await evaluate(`document.querySelector('.gcRecord [name="intent"]').value`), task.intent)
  currentWindow().showInactive(); await delay(300)
  await writeFile(join(output, '900-english.png'), (await currentWindow().webContents.capturePage()).toPNG()); currentWindow().hide()
  checks.push('English labels, keyboard Tab order and retained input')
  const before = await evaluate(`fetch('/api/godot-desktop/handoff?workspaceId='+${JSON.stringify(id)}).then(r=>r.json())`)
  const witnessBefore = await evaluate(`fetch('/api/godot-desktop/witness?workspaceId='+${JSON.stringify(id)}).then(r=>r.json())`)
  storage?.flushSync(); currentWindow().destroy(); window = undefined; await runtime.stop()
  await start(); await openWorkbench()
  for (const [key, value] of Object.entries(task)) assert.equal(await evaluate(`document.querySelector('.gcRecord [name="'+${JSON.stringify(key)}+'"]')?.value`), value)
  const after = await evaluate(`fetch('/api/godot-desktop/handoff?workspaceId='+${JSON.stringify(id)}).then(r=>r.json())`)
  assert.deepEqual(after, before)
  assert.deepEqual(await evaluate(`fetch('/api/godot-desktop/witness?workspaceId='+${JSON.stringify(id)}).then(r=>r.json())`), witnessBefore)
  checks.push('renderer close and actual Harness restart restore exact task/handoff')
  checks.push('game-only profile works while Office/PPT package imports are rejected')
  await writeFile(join(output, 'result.json'), JSON.stringify({ status: 'passed', checks, limitations: ['development runtime with existing preload', 'human experience and installed package not verified'] }, null, 2))
}
async function cleanup(code: number): Promise<void> {
  storage?.flushSync()
  window?.destroy(); await runtime?.stop()
  const log = await readFile(join(root, 'harness.log'), 'utf8').catch(error => String(error))
  await writeFile(join(output, 'harness.log'), log.replace(/([?&]token=)[^\s]+/g, '$1[REDACTED]'))
  app.exit(code)
}
main().then(() => cleanup(0), async error => {
  console.error(error)
  if (window && !window.isDestroyed()) {
    await writeFile(join(output, 'failure.txt'), await evaluate<string>('document.body.innerText'))
    window.showInactive(); await delay(300)
    await writeFile(join(output, 'failure.png'), (await window.webContents.capturePage()).toPNG())
  }
  await writeFile(join(output, 'result.json'), JSON.stringify({ status: 'failed', error: String(error), checks }, null, 2))
  await cleanup(1)
})
