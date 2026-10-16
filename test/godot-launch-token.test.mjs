import { spawn } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { HarnessRuntime } from '../src/main/runtime/harness-runtime'
import { TypertClient } from '../packages/dsh-godot-stack/bridge/session-client.mjs'
import { migrateLegacyAgentPresets } from '../src/main/state/legacy-preset-migration'

it('persists the actual endpoint for bridge authentication across runtime restarts', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'godot-launch-token-')))
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
      await writeFile(join(home, 'project.godot'), 'config_version=5\n[application]\nconfig/name="Desktop acceptance"\n')
      const { workspace } = await client.call('workspace/create', { request: { path: home } })
      const headers = { cookie: client.cookie, origin: snapshot.url.replace(/\/$/, ''), 'content-type': 'application/json' }
      const metadata = await fetch(`${snapshot.url}/api/godot-desktop/project?workspaceId=${workspace.workspaceId}`, { headers })
      expect(metadata.status).toBe(200)
      expect(await metadata.json()).toMatchObject({ godot: true, name: 'Desktop acceptance' })
      const created = await fetch(`${snapshot.url}/api/godot-desktop/session?workspaceId=${workspace.workspaceId}`, { method: 'POST', headers, body: '{}' })
      expect(created.status).toBe(200)
      const { sessionId } = await created.json()
      expect(typeof sessionId).toBe('string')
      const list = await client.call('session/list', { _request: {} })
      expect(list.items.find(item => item.sessionId === sessionId)?.cwd).toBe(home)
      const currentWorkspace = await client.call('workspace/create', { request: { path: home } })
      expect(currentWorkspace.workspace.sessionIds).toContain(sessionId)
      const html = await (await fetch(snapshot.url, { headers })).text()
      expect(html).toContain('dsh-godot-stack')
      // Backend presentation tools remain installed, but game development does
      // not advertise their automatic browser modules or Composer controls.
      expect(html).not.toContain('"dsh-ppt-composer"')
      expect(html).not.toContain('"dsh-ppt"')
      const roster = await client.call('agentPresets/list', {})
      const godotPresets = roster.presets.filter(preset => preset.id.startsWith('godot-'))
      expect(godotPresets.map(preset => preset.id)).toEqual(expect.arrayContaining([
        'godot-codely-lite', 'godot-scene-expert', 'godot-shader-expert', 'godot-gdscript-expert'
      ]))
      for (const preset of godotPresets) expect(preset.broken, preset.id).toBeUndefined()
      const session = await client.createSession({ cwd: home, preset: 'godot-codely-lite' })
      expect(session.agentPreset).toBe('godot-codely-lite')
      await runtime.stop()
      // Desktop maintenance runs between boots and must not re-register the
      // host plugin's copied presets as independent legacy user entries.
      await migrateLegacyAgentPresets(home, () => {})
    }
  } finally {
    await runtime.stop()
    await rm(home, { recursive: true, force: true, maxRetries: 5 })
  }
}, 420000)
