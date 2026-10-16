/** Native Windows Electron restart acceptance with an owned appData root. */
import { mkdir, mkdtemp, readFile, writeFile, realpath, rm } from 'node:fs/promises'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { ProjectStore, projectHandoff } from '../../packages/dsh-godot-stack/governance/index.mjs'
import { TypertClient } from '../../packages/dsh-godot-stack/bridge/session-client.mjs'
const pause = ms => new Promise(done => setTimeout(done, ms))
const repo = resolve('.')
const project = resolve(process.argv[2] ?? '')
assert.ok(process.argv[2], 'Supply a real project path')
assert.equal(process.platform, 'win32', 'Native Windows acceptance only')
const output = resolve('.build/governance-desktop-probe')
await mkdir(output, { recursive: true })
const root = await mkdtemp(join(output, 'isolated-'))
const appData = join(root, 'appdata')
await mkdir(appData, { recursive: true })
const home = join(appData, 'godot-codely-dev', 'harness')
const store = new ProjectStore(home)
const actor = { kind: 'ADAPTER', id: 'desktop-readonly-acceptance' }
let state = await store.create(project, { actor, reason: 'User requested real-project G1b desktop acceptance; isolated appData' })
const evidence = JSON.parse(await readFile(resolve('.build/governance-real-project-probe/real-project-evidence.json'), 'utf8'))
state = await store.commit(project, { projectId: state.projectId, expectedStateRevision: state.stateRevision, actor, reason: 'Preserve scoped read-only facts without granting execution', changes: { currentTask: { id: 'G1B-DESKTOP', runId: 'desktop-1', intent: 'Check Codely desktop restart restores real-project handoff', boundary: 'Read project only; no gameplay/save/publish changes', stop: 'Stop on state mismatch', stage: 'WITNESS', progress: 'Scoped entry-file inspection completed; desktop acceptance in progress', unverifiedChanges: ['Game behavior not tested'], stopReason: 'EXPERIENCE_PENDING', recommendedNextAction: 'Review restored handoff before resuming any work', requiresHuman: 'Judge whether this reduces repeated instructions' }, implementationRevision: { contentFingerprint: evidence.fingerprint, gitHead: null, godotVersion: null } } })
state = await store.commit(project, { projectId: state.projectId, expectedStateRevision: state.stateRevision, expectedImplementationFingerprint: evidence.fingerprint, actor, reason: 'Keep actual results and limitations', changes: { appendObservations: [{ id: 'READONLY-ENTRY', projectId: state.projectId, taskId: 'G1B-DESKTOP', runId: 'desktop-1', kind: 'readonly-entry', provenance: 'ADAPTER_CAPTURED', outcome: 'PASS', inputFingerprint: evidence.fingerprint, environmentFingerprint: process.version, assertions: evidence.assertions, artifactRefs: ['real-project-evidence.json'], limitations: evidence.limitations, observedAt: evidence.observedAt }] } })
async function verifySelectedFiles() {
 for (const file of evidence.files) {
  const path = await realpath(join(project, file.path))
  const local = relative(await realpath(project), path)
  assert.ok(local !== '..' && !local.startsWith('..\\') && !local.startsWith('../') && !isAbsolute(local), 'Inspected resource stays inside project')
  assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), file.sha256, 'Selected project input must not change')
 }
}
await verifySelectedFiles()
const expected = projectHandoff(await store.read(project))
const warmProfile = process.argv.includes('--warm-profile')
if (warmProfile) {
 const { provisionGodotPresets } = await import('../../node_modules/dsh-godot-stack/index.js')
 const { provisionMcpRuntime } = await import('../../node_modules/dsh-godot-stack/mcp-runtime.mjs')
 await provisionGodotPresets(home)
 await provisionMcpRuntime(resolve('node_modules/dsh-godot-stack/godot-stack/mcp/godot-mcp-server/runtime'), home, join(home, '.godot', 'mcp-server'))
 const settingsPath = join(home, 'settings.json')
 const settings = JSON.parse(await readFile(settingsPath, 'utf8'))
 settings.mcpServers.godot.command = resolve('node_modules/electron/dist/electron.exe')
 await writeFile(settingsPath, JSON.stringify(settings, null, 2))
}
const entry = join(root, 'entry.mjs')
await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'g1b-isolated-desktop', type: 'module', main: 'entry.mjs' }))
await writeFile(entry, `import { app } from 'electron';
import { writeFileSync, existsSync } from 'node:fs';
app.setPath('appData', ${JSON.stringify(appData)});
if (typeof app.setAppPath !== 'function') throw Error('Electron setAppPath unavailable');
app.setAppPath(${JSON.stringify(repo)});
app.on('browser-window-created', (_, win) => { win.on('show', () => win.hide()); });
await import(${JSON.stringify(pathToFileURL(join(repo, 'out/main/index.js')).href)});
const paths = { appData: app.getPath('appData'), userData: app.getPath('userData'), appPath: app.getAppPath() };
writeFileSync(${JSON.stringify(join(root, 'paths.json'))}, JSON.stringify(paths));
if (paths.userData !== ${JSON.stringify(join(appData, 'godot-codely-dev'))}) { app.exit(92); throw Error('Isolation mismatch'); }
setInterval(() => { if (existsSync(${JSON.stringify(join(root, 'quit'))})) app.quit(); }, 250).unref();
`)
async function port() {
 const server = createServer(); await new Promise(done => server.listen(0, '127.0.0.1', done)); const n = server.address().port; await new Promise(done => server.close(done)); return n
}
async function evaluate(target, expression) {
 const ws = new WebSocket(target.webSocketDebuggerUrl)
 await new Promise((done, reject) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', reject, { once: true }) })
 try { return await new Promise((done, reject) => { const timer = setTimeout(() => reject(Error('CDP timeout')), 5000); ws.addEventListener('message', event => { const value = JSON.parse(event.data); if (value.id !== 1) return; clearTimeout(timer); value.error || value.result?.exceptionDetails ? reject(Error('Renderer inspection failed')) : done(value.result.result.value) }); ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } })) }) }
 finally { ws.close() }
}
const runs = []
let workspaceId
try {
 for (const phase of ['first', 'reopen']) {
  await rm(join(root, 'quit'), { force: true })
  const debugPort = await port()
  const env = { ...process.env, APPDATA: appData, LOCALAPPDATA: join(root, 'local'), USERPROFILE: join(root, 'user'), HOME: join(root, 'user'), DSH_TELEMETRY_MODE: 'DISABLED', GODOT_CODELY_STARTUP_TRACE: '1', GODOT_CODELY_BRIDGE_PORT: '0', GODOT_CODELY_MEMORY_DIR: join(root, 'memories') }
  if (process.argv.includes('--default-bridge-memory')) { delete env.GODOT_CODELY_BRIDGE_PORT; delete env.GODOT_CODELY_MEMORY_DIR }
  delete env.ELECTRON_RUN_AS_NODE; delete env.DSH_HOME; delete env.ELECTRON_RENDERER_URL
  const child = spawn(resolve('node_modules/electron/dist/electron.exe'), [root, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + debugPort], { cwd: repo, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const runStarted = Date.now()
  let log = ''; const append = chunk => { log = (log + chunk).slice(-60000) }; child.stdout.on('data', append); child.stderr.on('data', append)
  let launchError; child.once('error', error => { launchError = error })
  const exited = new Promise(done => child.once('exit', done))
  try {
   let mounted = false
   const deadline = Date.now() + 180000
   while (Date.now() < deadline) {
    if (launchError) throw launchError
    if (/DSH entry failed:|plugin tree initialization timed out/.test(log)) throw Error('Harness startup failed; see captured phase log')
    if (child.exitCode !== null) throw Error('Desktop exited early: ' + child.exitCode)
    try {
     const targets = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list', { signal: AbortSignal.timeout(1500) })).json()
     const target = targets.find(t => t.type === 'page' && /^http:\/\/127\.0\.0\.1:/.test(t.url))
     if (target) mounted = await evaluate(target, `Boolean(window.__DSH_BOOT__ && window.__ModuleLoader__ && [...document.querySelectorAll('#root button, #root textarea')].some(e => Object.keys(e).some(k => k.startsWith('__reactProps$'))))`)
    } catch { /* Startup polling; bounded by deadline and child status. */ }
    if (mounted) break
    await pause(500)
   }
   assert.ok(mounted, 'Desktop bootstrap and hydrated React UI must mount')
   const paths = JSON.parse(await readFile(join(root, 'paths.json'), 'utf8'))
   assert.equal(paths.userData, join(appData, 'godot-codely-dev'))
   const client = new TypertClient('http://127.0.0.1:1', { tokenFile: join(home, 'godot-codely-launch-token') })
   if (!workspaceId) { const result = await client.call('workspace/create', { request: { path: project } }); workspaceId = result.workspace.workspaceId }
   assert.ok(workspaceId)
   const sessions = []
   for (let i = 0; i < 2; i++) { const session = await client.createSession({ workspaceId, preset: 'godot-codely-lite' }); assert.ok(session.sessionId); sessions.push(session.sessionId) }
   assert.ok(await client.auth())
   const response = await fetch(client.baseUrl + '/api/godot-desktop/handoff?workspaceId=' + encodeURIComponent(workspaceId), { headers: { cookie: client.cookie }, signal: AbortSignal.timeout(10000) })
   assert.equal(response.status, 200)
   const handoff = await response.json()
   assert.deepEqual(handoff, expected)
   runs.push({ phase, mountedAfterMs: Date.now() - runStarted, mounted, paths, workspaceRestored: true, sessionsCreated: sessions.length, handoff, executionAuthorized: handoff.executionAuthorized })
  } finally {
   await writeFile(join(root, 'quit'), '')
   const cleanExit = await Promise.race([exited.then(code => ({ code })), pause(12000).then(() => null)])
   if (!cleanExit) { child.kill(); await Promise.race([exited, pause(3000)]) }
   await writeFile(join(output, phase + '.log'), log.replace(/([?&]token=)[^\s&]+/g, '$1[redacted]'))
   if (!cleanExit) throw Error('Desktop did not exit cleanly')
   assert.equal(cleanExit.code, 0, 'Desktop normal shutdown')
  }
 }
 assert.deepEqual(runs[0].handoff, runs[1].handoff)
 await verifySelectedFiles()
 await writeFile(join(output, 'results.json'), JSON.stringify({ passed: true, warmProfile, defaultBridgeMemory: process.argv.includes('--default-bridge-memory'), inspectedFilesUnchanged: true, runs, humanUsefulness: 'NOT_TESTED', gameBehavior: 'NOT_TESTED', isolationRoot: root }, null, 2))
 console.log('Actual Electron UI mount + normal exit/reopen + authenticated real-project handoff: PASS')
} catch (error) {
 await writeFile(join(output, 'results.json'), JSON.stringify({ passed: false, runs, failure: error.stack, isolationRoot: root }, null, 2))
 throw error
}

// Only remove the owned fixture after all child processes have shut down; logs
// and result receipts above stay outside it. Never traverse a computed parent.
const physicalRoot = await realpath(root)
const ownedRelative = relative(await realpath(output), physicalRoot)
assert.ok(ownedRelative && !ownedRelative.startsWith('..') && !isAbsolute(ownedRelative), 'Cleanup is contained in probe output')
try {
 await rm(physicalRoot, { recursive: true, force: true, maxRetries: 0 })
 await writeFile(join(output, 'cleanup.json'), JSON.stringify({ status: 'REMOVED' }))
} catch (error) {
 if (!['EBUSY', 'EPERM', 'EACCES', 'ENOTEMPTY'].includes(error.code)) throw error
 // Input-method DLLs can retain their own log handles after Electron exits.
 // Retrying at every directory level amplifies the wait; report it once.
 await writeFile(join(output, 'cleanup.json'), JSON.stringify({ status: 'BLOCKED', code: error.code, root: physicalRoot }))
 console.error('Desktop assertions passed; fixture cleanup blocked by a file handle. See cleanup.json')
 process.exitCode = 2
}
