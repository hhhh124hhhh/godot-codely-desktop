/** Real-model desktop acceptance. Credentials stay in inherited environment variables. */
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'

const uiOnly = process.argv.includes('--ui-only')
for (const name of uiOnly ? [] : ['GODOT_TEST_BIN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_MODEL']) {
  if (!process.env[name]) throw Error(`Set ${name} before running this real-model probe`)
}
const base = resolve('.build/godot-agent-desktop')
await mkdir(base, { recursive: true })
const output = await mkdtemp(join(base, 'run-'))
console.log('Evidence directory:', output)
const root = await mkdtemp(join(tmpdir(), 'codely-agent-'))
const entry = join(output, 'entry.mjs')
const env = { ...process.env, CODELY_AGENT_PROBE_ROOT: root, CODELY_AGENT_PROBE_OUTPUT: output }
delete env.ELECTRON_RUN_AS_NODE
delete env.CODELY_UNCONFIGURED_KEY
try {
  await build({ entryPoints: [uiOnly ? 'scripts/probes/godot-ui-desktop.ts' : 'scripts/probes/godot-agent-desktop.ts'], outfile: entry, bundle: true, platform: 'node', format: 'esm', packages: 'external' })
  process.exitCode = await new Promise((done, reject) => {
    const child = spawn(createRequire(import.meta.url)('electron'), [entry], { env, windowsHide: true, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', code => done(code ?? 1))
  })
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 5 })
}
