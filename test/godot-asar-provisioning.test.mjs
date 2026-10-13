import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, resolve } from 'node:path'
import { createPackage } from '@electron/asar'
import { expect, it } from 'vitest'

it('provisions complete presets, validated MCP and discoverable skills from a real ASAR', async () => {
  const root = await mkdtemp(resolve('.build/godot-asar-test-'))
  try {
    const staging = join(root, 'staging')
    const output = join(staging, 'node_modules/dsh-godot-stack')
    await mkdir(output, { recursive: true })
    await promisify(execFile)(process.execPath, ['scripts/build-godot-runtime.mjs', '--no-project', '--output', output], { windowsHide: true })
    const archive = join(root, 'app.asar')
    await createPackage(staging, archive)
    const executable = process.platform === 'win32'
      ? resolve('node_modules/electron/dist/electron.exe')
      : process.platform === 'darwin'
        ? resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
        : resolve('node_modules/electron/dist/electron')
    const { stdout } = await promisify(execFile)(executable, [resolve('scripts/verify-packaged-godot-runtime.cjs'), '--verify-runtime', archive], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 60000,
    })
    expect(stdout).toContain('Packaged Godot presets, MCP integrity and skills provisioning passed')
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
}, 90000)
