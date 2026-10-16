/** Boot a normal temporary Profile through Desktop's actual Node entry. */
import { mkdir, mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { provisionMcpRuntime } from '../../packages/dsh-godot-stack/mcp-runtime.mjs'
import assert from 'node:assert/strict'
const output = resolve('.build/governance-hook-probe')
await mkdir(output, { recursive: true })
const root = await mkdtemp(join(output, 'profile-'))
const home = join(root, 'home')
const profile = join(home, 'profiles', 'issue24-probe')
const project = join(root, 'project')
const launch = join(root, 'launch-root')
const receipt = join(root, 'receipt.json')
for (const p of [profile, project, launch]) await mkdir(p, { recursive: true })
const modules = resolve('node_modules')
// Explicit temporary Profile dependency projection; never point at a real user Profile.
await symlink(modules, join(home, 'profiles', 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'issue24-probe', private: true, dependencies: { '@deepseek-ai/dsh-base': '0.2.0-rc.2' }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } }))
await writeFile(join(profile, 'cordis.patch.yml'), '- insert:\n    - id: issue24-probe\n      name: ' + JSON.stringify(pathToFileURL(resolve('scripts/probes/governance-profile-plugin.mjs')).href) + '\n- id: telemetry\n  disabled: true\n')
await writeFile(join(project, 'project.godot'), 'config_version=5\n')
await writeFile(join(project, 'player.gd'), 'extends Node\n# profile baseline\n')
const generated = resolve('.build/governance-probe-runtime')
await provisionMcpRuntime(join(generated, 'godot-stack/mcp/godot-mcp-server/runtime'), home, join(home, '.godot/mcp-server'))
let log = ''
const child = spawn(process.execPath, [resolve('build/harness-node-entry.mjs'), resolve('node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', 'issue24-probe'], {
  cwd: launch, windowsHide: true, env: { ...process.env, DSH_HOME: home, DSH_PERMISSION_MODE: 'danger-full-access', DSH_TELEMETRY_MODE: 'OFF', ISSUE24_PROJECT: project, ISSUE24_RECEIPT: receipt, ISSUE24_MCP_PLUGIN: pathToFileURL(join(generated, 'mcp-agent.mjs')).href, LOCALAPPDATA: join(output, 'native-cache'), APPDATA: join(root, 'appdata'), USERPROFILE: join(root, 'user'), HOME: join(root, 'user'), GODOT_CODELY_MEMORY_DIR: join(root, 'memories') }, stdio: ['ignore', 'pipe', 'pipe']
})
child.stdout.on('data', data => { log += data }); child.stderr.on('data', data => { log += data })
let launchError
child.on('error', error => { launchError = error })
const exited = new Promise(resolveExit => child.once('exit', (code, signal) => resolveExit({ code, signal })))
let result
try {
  for (let i = 0; i < 300; i++) {
    try { result = JSON.parse(await readFile(receipt, 'utf8')); break } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (launchError) throw launchError
    if (child.exitCode !== null) throw Error('Harness exited before receipt: ' + child.exitCode)
    await delay(100)
  }
  assert.ok(result, 'Harness Profile receipt timed out')
  assert.equal(result.passed, true, result.failure)
  console.log('Profile startup + real MCP/tool-fs allow/deny: PASS')
} finally {
  child.kill()
  await Promise.race([exited, delay(5000)])
  await writeFile(join(output, 'profile-results.json'), JSON.stringify({ fixture: relative(output, root), result, log }, null, 2))
  // Unlink only our verified dependency junction before recursively removing the owned fixture.
  await rm(join(home, 'profiles', 'node_modules'), { force: true })
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
