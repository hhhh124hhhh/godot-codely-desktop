import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import { AgentLoop } from '@deepseek-ai/dsh-agent-loop'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import { AgentPresetRegistry } from '@deepseek-ai/dsh-agent-preset-registry'
import { SessionStore } from '@deepseek-ai/dsh-session'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import { LlmAdapter, LlmRuntime, createUserMessage } from '@deepseek-ai/dsh-llm'
import { mkdtemp, mkdir, writeFile, readFile, rm, cp } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { provisionMcpRuntime } from '../packages/dsh-godot-stack/mcp-runtime.mjs'
import { pathToFileURL } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { BridgeServer } from '../packages/dsh-godot-stack/bridge/bridge.mjs'

const cleanups = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

it.skipIf(!process.env.GODOT_TEST_BIN)('loads real Harness scoped Godot tools, edits jump, verifies game output and returns compiler failures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'godot-agent-tools-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const home = join(root, 'home')
  // Other suites rebuild the common staging tree. Own a separate generated package for this process.
  const generated = await mkdtemp(join(process.cwd(), '.build/godot-agent-test-'))
  cleanups.push(() => rm(generated, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  await promisify(execFile)(process.execPath, ['scripts/build-godot-runtime.mjs', '--no-project', '--output', generated], { cwd: process.cwd(), windowsHide: true })
  const project = join(root, 'project')
  await mkdir(project, { recursive: true })
  const environment = ['APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOME']
  const savedEnvironment = new Map(environment.map(name => [name, process.env[name]]))
  for (const name of environment) { process.env[name] = join(root, name.toLowerCase()); await mkdir(process.env[name], { recursive: true }) }
  // The Loader maps a native DLL for the life of the test worker. Keep that
  // disposable cache outside the fixture removed by afterEach; clean after Vitest exits.
  process.env.LOCALAPPDATA = join(process.cwd(), '.build/godot-loader-native-cache')
  await mkdir(process.env.LOCALAPPDATA, { recursive: true })
  cleanups.push(() => { for (const [name, value] of savedEnvironment) { if (value === undefined) delete process.env[name]; else process.env[name] = value } })
  await provisionMcpRuntime(join(generated, 'godot-stack/mcp/godot-mcp-server/runtime'), home, join(home, '.godot/mcp-server'))
  const previous = { home: process.env.DSH_HOME, godot: process.env.GODOT_PATH, memory: process.env.GODOT_CODELY_MEMORY_DIR }
  process.env.DSH_HOME = home
  process.env.GODOT_PATH = process.env.GODOT_TEST_BIN
  process.env.GODOT_CODELY_MEMORY_DIR = join(root, 'memories')
  cleanups.push(() => { for (const [name, value] of [['DSH_HOME', previous.home], ['GODOT_PATH', previous.godot], ['GODOT_CODELY_MEMORY_DIR', previous.memory]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value } })
  await writeFile(join(project, 'project.godot'), 'config_version=5\n[application]\nconfig/name="jump-validation"\nrun/main_scene="res://main.tscn"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n')
  await writeFile(join(project, 'main.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://player.gd" id="1"]\n[node name="Player" type="CharacterBody2D"]\nscript = ExtResource("1")\n')
  const script = speed => `extends CharacterBody2D\nconst JUMP_VELOCITY = -${speed}.0\nfunc _ready() -> void:\n\tvelocity.y = JUMP_VELOCITY\n\tmove_and_slide()\n\tprint("JUMP_RESULT velocity=", velocity.y)\n\tget_tree().quit(0 if velocity.y == -600.0 else 1)\n`
  await writeFile(join(project, 'player.gd'), script(400))
  const ctx = new Context()
  for (const plugin of [SystemPrompt, ToolRuntime, SessionStore, SessionProjectionRegistry, AgentRegistry, LlmRuntime, AgentLoop]) {
    const fork = ctx.plugin(plugin)
    await fork
    cleanups.push(() => fork.dispose())
  }
  let modelCalls = 0
  const actions = [
    ['scripts', { action: 'read', script_path: 'res://player.gd' }],
    ['scripts', { action: 'write', script_path: 'res://player.gd', content: script(600) }],
    ['project', { action: 'verify', frames: 60 }],
  ]
  class DeterministicModel extends LlmAdapter {
    async *stream(request) {
      expect(request.tools.some(tool => tool.name === 'mcp__godot__project')).toBe(true)
      const action = actions[modelCalls++]
      const block = action ? { type: 'tool-call', id: 'model-' + modelCalls, name: 'mcp__godot__' + action[0], arguments: JSON.stringify(action[1]) } : { type: 'text', text: 'Jump updated and verified.' }
      yield { type: 'block-start', index: 0, blockType: block.type }
      yield { type: 'block-end', index: 0, block }
      yield { type: 'finish', reason: action ? { kind: 'tool-calls' } : { kind: 'stop' } }
    }
  }
  const registration = ctx.llm.registerAdapter(['test-model'], new DeterministicModel())
  cleanups.push(() => registration())
  // Use the real Loader and standing preset registry, not an Agent-only plugin fixture.
  const loader = ctx.plugin(Loader, { baseUrl: pathToFileURL(join(generated, 'package.json')).href })
  await loader
  cleanups.push(() => loader.dispose())
  const presets = ctx.plugin(AgentPresetRegistry, { default: 'godot-test' })
  await presets
  cleanups.push(() => presets.dispose())
  const generatedPlugin = await import(pathToFileURL(join(generated, 'index.js')).href)
  await generatedPlugin.provisionGodotPresets(home)
  const provisioned = parseYaml(await readFile(join(home, '.agent-presets/godot-codely-lite/agent.cordis.yml'), 'utf8'), { logLevel: 'silent' })
  const mcpRow = provisioned.find(row => row.id === 'godot-mcp')
  expect(mcpRow.name).toBe(pathToFileURL(join(generated, 'mcp-agent.mjs')).href)
  const unregister = await ctx.agentPresets.register({ id: 'godot-test', plugins: [mcpRow] })
  cleanups.push(unregister)
  expect(ctx.tools.schemas()).toEqual([])
  const handle = await ctx.agents.create({ sessionId: 'jump-session', meta: { cwd: project }, agentOptions: { provider: 'test-model', model: 'deterministic' }, setup: agentCtx => ctx.agentPresets.mount(agentCtx, 'godot-test').then(() => undefined) })
  cleanups.push(() => handle.dispose())
  const agent = handle.agent
  const secondProject = join(root, 'second-project')
  await mkdir(secondProject, { recursive: true })
  await writeFile(join(secondProject, 'project.godot'), 'config_version=5\n')
  const second = await ctx.agents.create({ sessionId: 'second-session', meta: { cwd: secondProject }, agentOptions: { provider: 'test-model', model: 'deterministic' }, setup: agentCtx => ctx.agentPresets.mount(agentCtx, 'godot-test').then(() => undefined) })
  cleanups.push(() => second.dispose())
  const secondConfig = await ctx.tools.execute({ name: 'mcp__godot__config', arguments: { action: 'status' }, agent: second.agent, callId: 'second-config', signal: new AbortController().signal })
  expect(JSON.stringify(secondConfig)).toContain('second-project')
  const schemas = ctx.tools.schemas(agent)
  expect(schemas.some(tool => tool.name === 'mcp__godot__scripts')).toBe(true)
  expect(ctx.tools.schemas().some(tool => tool.name === 'mcp__godot__scripts')).toBe(false)
  const call = (name, args) => ctx.tools.execute({ name: 'mcp__godot__' + name, arguments: args, agent, callId: 'call-' + Math.random(), signal: new AbortController().signal })
  const before = await call('scripts', { action: 'read', script_path: 'res://player.gd' })
  const help = await call('help', { topic: 'project' })
  expect(help.isError).toBe(false)
  expect(JSON.stringify(help)).toContain('### verify')
  expect(JSON.stringify(before)).toContain('-400.0')
  const escaped = await call('scripts', { action: 'write', script_path: 'res://../escape.gd', content: 'extends Node' })
  expect(escaped.isError).toBe(true)
  const edit = await call('scripts', { action: 'write', script_path: 'res://player.gd', content: script(600) })
  expect(edit.isError).toBe(false)
  expect(await readFile(join(project, 'player.gd'), 'utf8')).toContain('-600.0')
  const verify = await call('project', { action: 'verify', frames: 60 })
  expect(verify.isError, JSON.stringify(verify)).toBe(false)
  expect(JSON.stringify(verify)).toContain('JUMP_RESULT velocity=-600')
  await writeFile(join(project, 'player.gd'), script(400))
  // The carrier fixture delegates to actual Harness objects; model output is deterministic.
  // Authentication/envelope behavior of the production Typert client is tested separately.
  const bridge = new BridgeServer({ port: 0, logger: { info() {}, warn() {} }, client: {
    createSession: async () => ({ sessionId: agent.session.id }),
    call: async () => ({ items: [{ sessionId: agent.session.id, cwd: project }] }),
    prompt: async (_id, text) => { agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })); return { accepted: true } },
    page: async (_id, { since }) => {
      const events = agent.session.snapshotEvents()
      return { records: events.filter(event => event.seq > since).map(event => ({ type: 'event', event })), nextSeq: events.at(-1)?.seq ?? -1 }
    },
  } })
  await bridge.start()
  cleanups.push(() => bridge.stop())
  await cp(join(process.cwd(), 'packages/dsh-godot-stack/godot-stack/addons'), join(project, 'addons'), { recursive: true })
  await writeFile(join(project, 'panel-agent-test.gd'), `extends SceneTree
func _initialize() -> void:
\t_run.call_deferred()
func _run() -> void:
\tvar panel = load("res://addons/godot_codely_ai/panel.gd").new()
\troot.add_child(panel)
\tvar deadline := Time.get_ticks_msec() + 25000
\twhile not panel._agent_ready and Time.get_ticks_msec() < deadline:
\t\tawait process_frame
\tif not panel._agent_ready:
\t\tprinterr("PANEL_CONNECT_FAILED: ", panel._log.text)
\t\tquit(1)
\t\treturn
\tpanel._input.text = "Change jump velocity from -400 to -600 and run validation."
\tawait panel._on_send_pressed()
\twhile not panel._log.get_parsed_text().contains("Jump updated and verified.") and Time.get_ticks_msec() < deadline:
\t\tawait process_frame
\tvar transcript: String = panel._log.get_parsed_text()
\tprint("PANEL_TRANSCRIPT: ", transcript)
\tvar passed: bool = transcript.contains("JUMP_RESULT velocity=-600") and transcript.contains("你：Change jump velocity") and transcript.contains("AI：Jump updated and verified.") and not panel._agent_busy
\tprint("PANEL_AGENT_LOOP_OK" if passed else "PANEL_AGENT_LOOP_FAILED")
\tpanel.queue_free()
\tawait process_frame
\tpanel = load("res://addons/godot_codely_ai/panel.gd").new()
\troot.add_child(panel)
\twhile not panel._log.get_parsed_text().contains("Jump updated and verified.") and Time.get_ticks_msec() < deadline:
\t\tawait process_frame
\tpassed = passed and panel._log.get_parsed_text().contains("JUMP_RESULT velocity=-600")
\tprint("PANEL_AGENT_REPLAY_OK" if passed else "PANEL_AGENT_REPLAY_FAILED")
\tpanel.queue_free()
\tawait process_frame
\tquit(0 if passed else 1)
`)
  const panelRun = await promisify(execFile)(process.env.GODOT_TEST_BIN, ['--headless', '--path', project, '--script', 'res://panel-agent-test.gd'], {
    env: { ...process.env, GODOT_CODELY_BRIDGE_URL: `http://127.0.0.1:${bridge.port}` }, timeout: 35000, windowsHide: true,
  }).catch(error => { throw Error('Panel process failed:\n' + error.stdout + '\n' + error.stderr + '\nJournal:\n' + JSON.stringify(agent.session.snapshotEvents().filter(event => event.type !== 'request/header'))) })
  expect(panelRun.stdout).toContain('PANEL_AGENT_LOOP_OK')
  expect(panelRun.stdout).toContain('PANEL_AGENT_REPLAY_OK')
  expect(panelRun.stderr).not.toContain('SCRIPT ERROR:')
  const events = agent.session.snapshotEvents()
  expect(modelCalls, JSON.stringify(events)).toBe(4)
  expect(events.filter(event => event.kind === 'tool/result' || event.type === 'tool/result')).toHaveLength(3)
  expect(JSON.stringify(events)).toContain('JUMP_RESULT velocity=-600')
  expect(await readFile(join(project, 'player.gd'), 'utf8')).toContain('-600.0')
  await call('scripts', { action: 'write', script_path: 'res://player.gd', content: 'extends CharacterBody2D\nfunc broken(\n' })
  const broken = await call('project', { action: 'verify' })
  expect(broken.isError).toBe(true)
  expect(JSON.stringify(broken)).toContain('Parse Error')
}, 90000)
