import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, cp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { BridgeServer } from '../packages/dsh-godot-stack/bridge/bridge.mjs'

async function until(check, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)) }
  throw Error('Godot editor condition timed out')
}

it.skipIf(!process.env.GODOT_TEST_BIN)('dispatches Play and Stop through the real Windows editor and observes its native playing state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'godot-editor-control-'))
  const project = join(root, 'project')
  const bridge = new BridgeServer({ port: 0, client: {
    createSession: async () => ({ sessionId: 'editor-test' }),
    page: async () => ({ records: [], nextSeq: -1, hasMore: false }),
  }, logger: { info() {}, warn() {} } })
  await bridge.start()
  const env = { ...process.env, DSH_HOME: join(root, 'home'), GODOT_CODELY_BRIDGE_URL: `http://127.0.0.1:${bridge.port}` }
  for (const name of ['APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOME']) { env[name] = join(root, name.toLowerCase()); await mkdir(env[name], { recursive: true }) }
  await mkdir(project, { recursive: true })
  await cp(join(process.cwd(), 'packages/dsh-godot-stack/godot-stack/addons'), join(project, 'addons'), { recursive: true })
  await writeFile(join(project, 'project.godot'), 'config_version=5\n[application]\nconfig/name="editor-control-test"\nrun/main_scene="res://main.tscn"\n[editor_plugins]\nenabled=PackedStringArray("res://addons/godot_codely_ai/plugin.cfg")\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n')
  await writeFile(join(project, 'main.tscn'), '[gd_scene format=3]\n[node name="Main" type="Node2D"]\n')
  const child = spawn(process.env.GODOT_TEST_BIN, ['--headless', '--editor', '--path', project], { env, windowsHide: true })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve) })
  const action = action => bridge.editorControl.execute({ projectPath: project, action })
  try {
    await until(() => bridge.editorControl.editors.size === 1)
    await until(() => output.includes('loading_editor_layout'))
    expect(await action('status')).toMatchObject({ ok: true, playing: false })
    expect(await action('scan')).toMatchObject({ ok: true })
    expect(await action('play')).toMatchObject({ ok: true })
    await until(async () => (await action('status')).playing === true, 10000)
    expect(await action('play')).toMatchObject({ ok: false, error: 'A scene is already playing; stop it before starting another' })
    expect(await action('stop')).toMatchObject({ ok: true })
    await until(async () => (await action('status')).playing === false, 10000)
    expect(output).not.toContain('SCRIPT ERROR:')
    expect(output).not.toContain('Parse Error:')
    expect(output).not.toContain('Error calling from signal')
  } catch (error) { throw Error(error.message + '\n' + output) }
  finally {
    // Stop only the game owned by this isolated editor before closing the editor itself.
    if (child.exitCode === null && bridge.editorControl.editors.size) await action('stop').catch(() => {})
    child.kill()
    await done
    await bridge.stop()
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  }
}, 70000)
