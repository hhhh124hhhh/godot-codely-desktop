/** Read-only real-project G1b acceptance. No Godot import or user save writes. */
import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises'
import { resolve, join, relative, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
assert.ok(process.argv[2], 'Usage: node scripts/probes/governance-real-project.mjs <project>')
const project = await realpath(resolve(process.argv[2]))
const output = resolve('.build/governance-real-project-probe')
await mkdir(output, { recursive: true })
const config = await readFile(join(project, 'project.godot'), 'utf8')
const scene = /run\/main_scene="res:\/\/([^"\r\n]+)"/.exec(config)?.[1]
assert.ok(scene, 'A res:// main scene must be configured')
const files = new Set(['project.godot', scene])
const sceneText = await readFile(join(project, scene), 'utf8')
for (const match of sceneText.matchAll(/path="res:\/\/([^"\r\n]+)"/g)) files.add(match[1])
async function snapshot() {
  const rows = []
  for (const name of [...files].sort()) {
    const path = await realpath(join(project, name))
    const local = relative(project, path)
    assert.ok(local !== '..' && !local.startsWith('..\\') && !local.startsWith('../') && !isAbsolute(local), 'Dependency stays inside project')
    assert.ok((await stat(path)).isFile(), name + ' must be a file')
    rows.push({ path: name, sha256: createHash('sha256').update(await readFile(path)).digest('hex') })
  }
  return rows
}
const before = await snapshot()
const evidence = { observedAt: new Date().toISOString(), fingerprint: createHash('sha256').update(JSON.stringify(before)).digest('hex'), files: before, assertions: ['project.godot declares a res:// main scene', 'Main scene and its directly referenced resource files exist', 'Selected files SHA-256 captured before restart'], limitations: ['Not an engine execution or complete recursive resource validation'] }
const evidencePath = join(output, 'real-project-evidence.json')
await writeFile(evidencePath, JSON.stringify(evidence, null, 2))
const code = await new Promise((done, reject) => {
  const child = spawn(process.execPath, [resolve('scripts/probes/governance-reopen.mjs')], { windowsHide: true, stdio: 'inherit', env: { ...process.env, ISSUE24_REAL_PROJECT: project, ISSUE24_REAL_EVIDENCE: evidencePath } })
  child.once('error', reject); child.once('exit', done)
})
assert.equal(code, 0, 'Real Harness probe must pass')
assert.deepEqual(await snapshot(), before, 'Inspected project files remain unchanged')
await writeFile(join(output, 'real-project-summary.json'), JSON.stringify({ passed: true, inspectedFiles: before.length, inspectedFilesUnchanged: true, actualHarnessRestart: 'PASS', agentSwitch: 'PASS', originalGrantAbsent: true, desktopWindow: 'NOT_TESTED', humanHandoffUsefulness: 'NOT_TESTED', scope: 'OBSERVED G1b' }, null, 2))
console.log('Real project read-only G1b acceptance: PASS; desktop experience remains pending')
