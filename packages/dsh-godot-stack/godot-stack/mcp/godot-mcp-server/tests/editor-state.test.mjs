import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { access, cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const addon = path.resolve(here, '../../../addons/godot_codely_ai')

async function godotBin() {
  const candidates = [process.env.GODOT_TEST_BIN, '/usr/local/bin/godot', '/opt/godot/godot'].filter(Boolean)
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // try the next installed binary
    }
  }
  return ''
}

function runGodot(bin, args, env) {
  const child = spawn(bin, args, { env, windowsHide: true })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  return { child, done: once(child, 'exit').then(([code]) => ({ code, output })) }
}

test('editor state compose records selection, unsaved scenes and scene switches', { timeout: 30000 }, async (t) => {
  const bin = await godotBin()
  if (!bin) {
    t.diagnostic('Godot binary unavailable: compose check skipped')
    return
  }
  const home = await mkdtemp(path.join(tmpdir(), 'godot-state-compose-'))
  t.after(() => import('node:fs/promises').then(fs => fs.rm(home, { recursive: true, force: true })))
  const project = path.join(home, 'project')
  await mkdir(path.join(project, 'addons/godot_codely_ai'), { recursive: true })
  await cp(path.join(addon, 'editor_state.gd'), path.join(project, 'addons/godot_codely_ai/editor_state.gd'))
  await cp(path.join(here, 'editor-state-compose.gd'), path.join(project, 'editor-state-compose.gd'))
  await writeFile(path.join(project, 'project.godot'), 'config_version=5\n[application]\nconfig/name="state-compose"\n')
  const { done } = runGodot(bin, ['--headless', '--path', project, '--script', path.join(project, 'editor-state-compose.gd')], process.env)
  const result = await done
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /EDITOR_STATE_COMPOSE_OK/)
})

test('editor plugin republishes state on selection, unsaved edits and scene switches', { timeout: 90000 }, async (t) => {
  const bin = await godotBin()
  if (!bin) {
    t.diagnostic('Godot binary unavailable: live editor check skipped')
    return
  }
  const home = await mkdtemp(path.join(tmpdir(), 'godot-state-live-'))
  t.after(() => import('node:fs/promises').then(fs => fs.rm(home, { recursive: true, force: true })))
  const project = path.join(home, 'project')
  await mkdir(path.join(project, 'addons/state_probe'), { recursive: true })
  await cp(addon, path.join(project, 'addons/godot_codely_ai'), { recursive: true })
  await cp(path.join(here, 'editor-state-live.gd'), path.join(project, 'addons/state_probe/plugin.gd'))
  await writeFile(path.join(project, 'addons/state_probe/plugin.cfg'), '[plugin]\nname="State Probe"\ndescription="editor context regression"\nauthor="test"\nversion="0.0.1"\nscript="plugin.gd"\n')
  await writeFile(path.join(project, 'main.tscn'), '[gd_scene format=3]\n\n[node name="Main" type="Node2D"]\n\n[node name="Coin" type="Node2D" parent="."]\n')
  await writeFile(path.join(project, 'other.tscn'), '[gd_scene format=3]\n\n[node name="Other" type="Node2D"]\n')
  await writeFile(path.join(project, 'project.godot'), [
    'config_version=5',
    '[application]',
    'config/name="state-live"',
    'run/main_scene="res://main.tscn"',
    '[editor_plugins]',
    'enabled=PackedStringArray("res://addons/godot_codely_ai/plugin.cfg", "res://addons/state_probe/plugin.cfg")',
    '[rendering]',
    'renderer/rendering_method="gl_compatibility"',
    '',
  ].join('\n'))
  const env = { ...process.env, DSH_HOME: home }
  const { child, done } = runGodot(bin, ['--headless', '--editor', '--path', project], env)
  t.after(() => child.kill())
  const result = await done
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /EDITOR_CONTEXT_LIVE_OK/)
  assert.doesNotMatch(result.output, /Error calling from signal 'scene_(changed|closed|saved)'/)
})
