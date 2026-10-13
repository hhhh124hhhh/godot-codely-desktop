import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { HarnessRuntime } from '../src/main/runtime/harness-runtime'
import { TypertClient } from '../packages/dsh-godot-stack/bridge/session-client.mjs'

it('persists the actual endpoint for bridge authentication across runtime restarts', async () => {
  const home = await mkdtemp(join(tmpdir(), 'godot-launch-token-'))
  const runtime = new HarnessRuntime({
    dshEntryPath: resolve('node_modules/@deepseek-ai/dsh/lib/bin.js'),
    nodeEntryPath: resolve('build/harness-node-entry.mjs'),
    nodeExecutablePath: process.execPath,
    dshPatchPath: resolve('build/dsh-desktop.patch.yml'),
    dshSafePatchPath: resolve('build/dsh-desktop-safe.patch.yml'),
    dshHome: home,
    logPath: join(home, 'harness.log'),
    preferredPort: 0,
    startupTimeoutMs: 180000,
    launchProcess: (executable, args, options) => spawn(executable, args, options),
    onChanged() {}
  })
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      await runtime.start(home)
      const snapshot = runtime.snapshot()
      expect(snapshot.phase, snapshot.logs.join('\n')).toBe('ready')
      const tokenFile = join(home, 'godot-codely-launch-token')
      const [token, endpoint] = (await readFile(tokenFile, 'utf8')).trim().split(/\r?\n/)
      expect(endpoint).toBe(snapshot.url)
      expect(token).toBe(snapshot.authToken)
      const client = new TypertClient('http://127.0.0.1:1', { tokenFile })
      expect(await client.auth()).toBe(true)
      expect(client.baseUrl).toBe(snapshot.url)
      const roster = await client.call('agentPresets/list', {})
      const godotPresets = roster.presets.filter(preset => preset.id.startsWith('godot-'))
      expect(godotPresets.map(preset => preset.id)).toEqual(expect.arrayContaining([
        'godot-codely-lite', 'godot-scene-expert', 'godot-shader-expert', 'godot-gdscript-expert'
      ]))
      for (const preset of godotPresets) expect(preset.broken, preset.id).toBeUndefined()
      const session = await client.createSession({ cwd: home, preset: 'godot-codely-lite' })
      expect(session.agentPreset).toBe('godot-codely-lite')
      await runtime.stop()
    }
  } finally {
    await runtime.stop()
    await rm(home, { recursive: true, force: true, maxRetries: 5 })
  }
}, 420000)
