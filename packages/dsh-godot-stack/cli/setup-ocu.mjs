#!/usr/bin/env node
// Explicit installation only: boot provisioning never downloads a native runtime.
import { spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { ocuHome, OCU_VERSION, provisionOcuGateway } from '../godot-stack/ocu-gateway/ocu-runtime.mjs'

async function exists(path) {
  try { await access(path); return true } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

function checkRuntime(root) {
  const result = spawnSync(process.execPath, [join(root, 'node_modules', 'open-computer-use', 'bin', 'ocu'), 'capabilities', '--json'], {
    encoding: 'utf8', shell: false, windowsHide: true, timeout: 15_000,
  })
  if (result.error || result.status !== 0) {
    throw new Error(`OCU capability check failed: ${result.error?.message || result.stderr || result.status}`)
  }
  const capabilities = JSON.parse(result.stdout)
  if (capabilities.capabilities?.nativeMcp?.available !== true) throw new Error('OCU reports unavailable on this platform')
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length && !(args.length === 2 && args[0] === '--home')) throw new Error('usage: node setup-ocu.mjs [--home <DSH_HOME>]')
  const home = resolve(args[1] || ocuHome())
  const godot = join(home, '.godot')
  const runtime = join(godot, 'ocu-runtime')
  await mkdir(godot, { recursive: true })
  if (await exists(runtime)) {
    const manifest = JSON.parse(await readFile(join(runtime, 'node_modules', 'open-computer-use', 'package.json'), 'utf8'))
    if (manifest.name !== 'open-computer-use' || manifest.version !== OCU_VERSION) {
      throw new Error(`existing runtime differs from open-computer-use@${OCU_VERSION}; preserve it and choose a separate --home`)
    }
    checkRuntime(runtime)
  } else {
    const npmCli = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    await access(npmCli)
    const staging = await mkdtemp(join(godot, 'ocu-install-'))
    try {
      const result = spawnSync(process.execPath, [npmCli, 'install', '--prefix', staging, '--save-exact', '--no-audit', '--no-fund', `open-computer-use@${OCU_VERSION}`], {
        stdio: 'inherit', shell: false, windowsHide: true, timeout: 180_000,
      })
      if (result.error || result.status !== 0) throw new Error(`npm installation failed: ${result.error?.message || result.status}`)
      checkRuntime(staging)
      await rename(staging, runtime)
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  }
  const gateway = await provisionOcuGateway(home)
  console.log(JSON.stringify({
    serverName: 'ocu', transport: 'stdio', command: process.execPath, args: [gateway],
    env: { DSH_HOME: home, OCU_GATE_LEVEL: 'write-approve', OCU_ALLOWED_APPS: 'Godot*,godot*,Godot_*' },
  }, null, 2))
}

main().catch(error => {
  console.error(`[setup-ocu] ${error.message}`)
  process.exitCode = 1
})
