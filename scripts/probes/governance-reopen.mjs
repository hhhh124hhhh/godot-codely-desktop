/** Two complete Harness processes share only an owned temporary DSH_HOME. */
import { mkdir, mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'
assert.equal(Boolean(process.env.ISSUE24_REAL_PROJECT), Boolean(process.env.ISSUE24_REAL_EVIDENCE), 'Real project and read-only evidence must be provided together')
const output = resolve(process.env.ISSUE24_REAL_PROJECT ? '.build/governance-real-project-probe' : '.build/governance-reopen-probe')
await mkdir(output, { recursive: true })
const root = await mkdtemp(join(output, 'profile-'))
const home = join(root, 'home')
const profile = join(home, 'profiles', 'issue24-reopen')
const externalProject = process.env.ISSUE24_REAL_PROJECT
const project = externalProject ? resolve(externalProject) : join(root, 'project')
const other = join(root, 'other')
const launch = join(root, 'launch-root')
for (const path of [profile, ...(externalProject ? [] : [project]), other, launch]) await mkdir(path, { recursive: true })
await symlink(resolve('node_modules'), join(home, 'profiles', 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'issue24-reopen', private: true, dependencies: { '@deepseek-ai/dsh-base': '0.2.0-rc.2' }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } }))
await writeFile(join(profile, 'cordis.patch.yml'), '- insert:\n    - id: issue24-reopen\n      name: ' + JSON.stringify(pathToFileURL(resolve('scripts/probes/governance-reopen-plugin.mjs')).href) + '\n- id: telemetry\n  disabled: true\n')
for (const path of [...(externalProject ? [] : [project]), other]) await writeFile(join(path, 'project.godot'), 'config_version=5\n')
if (!externalProject) await writeFile(join(project, 'player.gd'), 'extends Node\n')
const runs = []
async function run(phase) {
  const receipt = join(root, phase + '.json')
  const started = Date.now()
  let log = ''
  const child = spawn(process.execPath, [resolve('build/harness-node-entry.mjs'), resolve('node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', 'issue24-reopen'], { cwd: launch, windowsHide: true, env: { ...process.env, DSH_HOME: home, DSH_PERMISSION_MODE: 'danger-full-access', DSH_TELEMETRY_MODE: 'OFF', ISSUE24_PROJECT: project, ISSUE24_OTHER_PROJECT: other, ISSUE24_RECEIPT: receipt, ISSUE24_PHASE: phase, ISSUE24_REAL_EVIDENCE: process.env.ISSUE24_REAL_EVIDENCE ?? '', ISSUE24_RUNTIME: pathToFileURL(resolve('.build/governance-probe-runtime') + '/').href, LOCALAPPDATA: join(output, 'native-cache'), APPDATA: join(root, 'appdata'), USERPROFILE: join(root, 'user'), HOME: join(root, 'user'), GODOT_CODELY_MEMORY_DIR: join(root, 'memories') }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', data => { log += data }); child.stderr.on('data', data => { log += data })
  let launchError; child.on('error', error => { launchError = error })
  const exited = new Promise(resolveExit => child.once('exit', resolveExit))
  let result
  try {
    for (let i = 0; i < 400; i++) {
      try { result = JSON.parse(await readFile(receipt, 'utf8')); break } catch (error) { if (error.code !== 'ENOENT') throw error }
      if (launchError) throw launchError
      if (child.exitCode !== null) throw Error('Harness exited before receipt: ' + child.exitCode)
      await delay(100)
    }
    runs.push({ phase, elapsedMs: Date.now() - started, result, log })
    assert.ok(result, 'Harness receipt timed out'); assert.equal(result.passed, true, result.failure)
    return result
  } finally { child.kill(); await Promise.race([exited, delay(5000)]) }
}
try {
  const written = await run('write')
  const resumed = await run('reopen')
  assert.deepEqual(resumed.state, written.state)
  assert.deepEqual(resumed.handoff, written.handoff)
  assert.equal(resumed.promptHandoff, written.promptHandoff)
  assert.equal(resumed.handoff.authorizationRecordStatus, externalProject ? 'ABSENT' : 'EXPIRED')
  assert.equal(resumed.handoff.executionAuthorized, false)
  assert.deepEqual(resumed.handoff.verificationRecords.map(item => item.outcome), externalProject ? ['PASS', 'UNKNOWN'] : ['PASS', 'FAIL'])
  if (!externalProject) await writeFile(join(output, 'verification.txt'), await readFile(join(project, 'verification.txt')))
  console.log('G1b actual Harness restart + Agent switch + permissions/tool preservation: PASS')
} finally {
  await writeFile(join(output, 'results.json'), JSON.stringify({ runs }, null, 2))
  await rm(join(home, 'profiles', 'node_modules'), { force: true })
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
