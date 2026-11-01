/** Isolated native UI acceptance; no model requests or user projects. */
import { build } from 'esbuild'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'

const base = resolve('.build/governance-record-ui')
await mkdir(base, { recursive: true })
const output = await mkdtemp(join(base, 'run-'))
console.log('Evidence directory:', output)
const root = await mkdtemp(join(tmpdir(), 'codely-record-ui-'))
const entry = join(output, 'entry.mjs')
const env = { ...process.env, CODELY_RECORD_ROOT: root, CODELY_RECORD_OUTPUT: output }
delete env.ELECTRON_RUN_AS_NODE
try {
  const hashes = {}
  async function record(path) {
    hashes[path] = createHash('sha256').update(await readFile(path)).digest('hex')
  }
  for (const path of ['package.json', 'package-lock.json', 'build/dsh-desktop.patch.yml', 'build/harness-node-entry.mjs', 'patches/@deepseek-ai+dsh+0.2.0-rc.2.patch', 'node_modules/@deepseek-ai/dsh/package.json', 'out/main/index.js', 'out/preload/index.cjs', 'node_modules/dsh-godot-stack/package.json', 'node_modules/dsh-godot-stack/index.js', 'node_modules/dsh-godot-stack/client.js', 'node_modules/dsh-godot-stack/desktop-api.mjs']) await record(path)
  for (const file of await readdir('node_modules/dsh-godot-stack/governance')) await record('node_modules/dsh-godot-stack/governance/' + file)
  await writeFile(join(output, 'candidate.json'), JSON.stringify({
    head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(),
    identity: 'working tree and generated development runtime; not an installed release',
    applicationVersion: JSON.parse(await readFile('package.json', 'utf8')).version,
    harnessVersion: JSON.parse(await readFile('node_modules/@deepseek-ai/dsh/package.json', 'utf8')).version,
    nodeVersion: process.version, platform: process.platform, arch: process.arch, hashes,
  }, null, 2))
  await build({ entryPoints: ['scripts/probes/governance-record-ui.ts'], outfile: entry, bundle: true, platform: 'node', format: 'esm', packages: 'external' })
  process.exitCode = await new Promise((done, reject) => {
    const child = spawn(createRequire(import.meta.url)('electron'), [entry], { env, windowsHide: true, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', code => done(code ?? 1))
  })
} finally {
  await rm(entry, { force: true })
  if (dirname(resolve(root)) !== resolve(tmpdir())) throw Error('Unexpected temporary profile parent')
  await rm(root, { recursive: true, force: true, maxRetries: 5 })
}
