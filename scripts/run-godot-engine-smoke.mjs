/** Run native acceptance with an isolated Profile and a caller-selected Godot executable. */
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'

if (!process.env.GODOT_TEST_BIN) throw Error('Set GODOT_TEST_BIN to a real Godot 4 executable')
const output = resolve('.build/godot-engine-acceptance')
await mkdir(output, { recursive: true })
await rm(join(output, 'result.json'), { force: true })
const root = await mkdtemp(join(tmpdir(), 'godot-engine-native-'))
const entry = join(output, 'smoke.mjs')
const require = createRequire(import.meta.url)
const env = { ...process.env, GODOT_ENGINE_SMOKE_ROOT: root, GODOT_ENGINE_SMOKE_OUTPUT: output }
delete env.ELECTRON_RUN_AS_NODE
try {
  await build({ entryPoints: ['scripts/godot-engine-smoke.ts'], outfile: entry, bundle: true, platform: 'node', format: 'esm', packages: 'external' })
  const exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(require('electron'), [entry], { env, windowsHide: true, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', code => resolveExit(code ?? 1))
  })
  process.exitCode = exitCode
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 5 })
}
