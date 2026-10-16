/** Isolated issue #24 probe. Never loads the user's Profile or model credentials. */
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import { AgentLoop } from '@deepseek-ai/dsh-agent-loop'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import { AgentPresetRegistry } from '@deepseek-ai/dsh-agent-preset-registry'
import { SessionStore } from '@deepseek-ai/dsh-session'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import { LlmRuntime } from '@deepseek-ai/dsh-llm'
import { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import { ApprovalService } from '@deepseek-ai/dsh-user-approval'
import { SandboxedFileSystem } from '@deepseek-ai/dsh-fs-sandbox'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import { LocalSandboxProvider } from '@deepseek-ai/dsh-sandbox-local'
import { SandboxPwshExecutor } from '@deepseek-ai/dsh-pwsh-sandbox'
import * as shellEnv from '@deepseek-ai/dsh-shell-env'
import * as toolPwsh from '@deepseek-ai/dsh-tool-pwsh'
import * as toolFs from '@deepseek-ai/dsh-tool-fs'
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, resolve, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { provisionMcpRuntime } from '../../packages/dsh-godot-stack/mcp-runtime.mjs'
import { parse as parseYaml } from 'yaml'

const require = createRequire(import.meta.url)
const output = resolve('.build/governance-hook-probe')
await mkdir(output, { recursive: true })
const root = await realpath(await mkdtemp(join(output, 'fixture-')))
const home = join(root, 'home')
const project = join(root, 'project')
const other = join(root, 'other')
for (const p of [home, project, other]) await mkdir(p, { recursive: true })
process.env.DSH_HOME = home
process.env.LOCALAPPDATA = join(output, 'native-cache')
process.env.GODOT_CODELY_MEMORY_DIR = join(root, 'memories')
const generated = resolve('.build/governance-probe-runtime')
const file = join(project, 'player.gd')
const otherFile = join(other, 'player.gd')
const rows = []
const forks = []
const ctx = new Context()
const hash = async p => createHash('sha256').update(await readFile(p)).digest('hex')
const baseline = 'extends Node\n# baseline\n'
const record = (id, data) => { rows.push({ id, ...data }); console.log(id, data.verdict ?? data.result?.isError) }
let fail
try {
  await writeFile(join(project, 'project.godot'), 'config_version=5\n[application]\nconfig/name="governance-probe"\n')
  await writeFile(join(other, 'project.godot'), 'config_version=5\n[application]\nconfig/name="other-probe"\n')
  await writeFile(file, baseline); await writeFile(otherFile, baseline)
  await provisionMcpRuntime(join(generated, 'godot-stack/mcp/godot-mcp-server/runtime'), home, join(home, '.godot/mcp-server'))
  const mount = async (plugin, config = {}) => {
    const fork = ctx.plugin(plugin, config); forks.push(fork)
    let timer
    try { await Promise.race([fork, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Plugin timeout: ' + (plugin.name ?? 'module'))), 20000) })]) }
    finally { clearTimeout(timer) }
    return fork
  }
  for (const p of [SystemPrompt, ToolRuntime, SessionStore, SessionProjectionRegistry, AgentRegistry, LlmRuntime, AgentLoop]) await mount(p)
  await mount(SandboxPolicyService, { mode: 'danger-full-access', workspaceRoot: project })
  await mount(SandboxedFileSystem, { cwd: project })
  await mount(toolFs)
  await mount(LocalSubprocessRuntime)
  await mount(LocalSandboxProvider)
  await mount(SandboxPwshExecutor, { cwd: project })
  await mount(shellEnv, { dshHome: home })
  await mount(toolPwsh, { enableRunInBackground: false })
  await mount(ApprovalService, { policy: 'ask' })
  await mount(Loader, { baseUrl: pathToFileURL(join(generated, 'package.json')).href })
  await mount(AgentPresetRegistry, { default: 'governance-probe' })
  const generatedPlugin = await import(pathToFileURL(join(generated, 'index.js')).href)
  await generatedPlugin.provisionGodotPresets(home)
  const provisioned = parseYaml(await readFile(join(home, '.agent-presets/godot-codely-lite/agent.cordis.yml'), 'utf8'), { logLevel: 'silent' })
  const mcpRow = provisioned.find(row => row.id === 'godot-mcp')
  assert.ok(mcpRow)
  await ctx.agentPresets.register({ id: 'governance-probe', plugins: [mcpRow] })
  const handle = await ctx.agents.create({ sessionId: 'governance-probe', meta: { cwd: project }, agentOptions: { provider: 'unconfigured', model: 'no-model-used', mode: 'default' }, setup: agentCtx => ctx.agentPresets.mount(agentCtx, 'governance-probe').then(() => undefined) })
  const agent = handle.agent
  assert.equal(ctx.sandboxPolicy.resolve({ session: agent.session }).mode, 'danger-full-access')
  const call = (id, name, args) => ctx.tools.execute({ name, arguments: args, agent, callId: id, signal: new AbortController().signal })
  const readArgs = { action: 'read', script_path: 'res://player.gd' }
  const writeArgs = content => ({ action: 'write', script_path: 'res://player.gd', content })
  const mcpWrite = 'mcp__godot__scripts'
  const check = async (id, name, args, expectation, target = file) => {
    const before = await hash(target)
    const result = await call(id, name, args)
    const after = await hash(target)
    record(id, { tool: name, before, after, result })
    assert.equal(result.isError, expectation === 'deny', JSON.stringify(result))
    if (expectation === 'write') assert.notEqual(before, after)
    else assert.equal(before, after)
    return result
  }
  await check('mcp-read', mcpWrite, readArgs, 'read')
  await check('mcp-allow', mcpWrite, writeArgs('extends Node\n# allowed MCP\n'), 'write')
  await check('fs-allow', 'write', { file_path: file, content: 'extends Node\n# allowed FS\n' }, 'write')
  const psArgs = { command: "Set-Content -LiteralPath '" + file.replaceAll("'", "''") + "' -Value '# PowerShell write'", description: 'Write isolated governance probe test fixture', timeoutMs: 10000 }
  await check('powershell-full-allow', 'pwsh', psArgs, 'write')
  const psGuard = ctx.tools.guard(exec => exec.name === 'pwsh' ? 'ISSUE24_DENY: shell disabled in managed scope' : undefined)
  await check('powershell-full-deny', 'pwsh', { ...psArgs, command: psArgs.command.replace('# PowerShell write', '# FORBIDDEN') }, 'deny')
  psGuard()
  let denied = true
  let stale = false
  let wrongProject = false
  const isWrite = exec => exec.name === 'write' || exec.name === mcpWrite && exec.arguments.action === 'write'
  const policy = exec => isWrite(exec) && (denied || stale || wrongProject) ? 'ISSUE24_DENY: scope frozen, stale or wrong project' : undefined
  const guard = ctx.tools.guard(policy)
  const allowListener = ctx.on('tools/pre-execute', async () => ({ kind: 'allow' }))
  for (const [name, args] of [[mcpWrite, writeArgs('FORBIDDEN')], ['write', { file_path: file, content: 'FORBIDDEN' }]]) {
    const r = await check('full-deny-' + name, name, args, 'deny'); assert.match(JSON.stringify(r), /ISSUE24_DENY/)
  }
  await check('read-while-frozen', mcpWrite, readArgs, 'read')
  await Promise.all(['a', 'b'].map(suffix => check('concurrent-' + suffix, mcpWrite, writeArgs('FORBIDDEN'), 'deny')))
  denied = false; stale = true
  await check('stale-policy', mcpWrite, writeArgs('FORBIDDEN'), 'deny')
  stale = false; wrongProject = true
  await check('wrong-project-policy', mcpWrite, writeArgs('FORBIDDEN'), 'deny')
  wrongProject = false
  allowListener()
  agent.session.append('turn/start', { turn: 1 })
  let answer = 'rejected'
  let requests = 0
  const ask = ctx.on('tools/pre-execute', async exec => isWrite(exec) ? { kind: 'ask', reason: 'probe native approval' } : { kind: 'allow' })
  const approval = ctx.on('approval/request', async () => { requests++; return answer })
  await check('native-rejected', mcpWrite, writeArgs('REJECTED'), 'deny')
  answer = 'allowed-once'; denied = true
  const approvedButDenied = await check('native-approved-governance-denied', mcpWrite, writeArgs('FORBIDDEN'), 'deny')
  assert.match(JSON.stringify(approvedButDenied), /ISSUE24_DENY/)
  denied = false
  await check('native-approved-governance-allowed', mcpWrite, writeArgs('extends Node\n# native-approved\n'), 'write')
  assert.equal(requests, 3)
  ask(); approval()
  const audit = agent.session.snapshotEvents().filter(event => event.type.startsWith('approval/'))
  assert.deepEqual(audit.map(event => event.type), Array(3).fill(['approval/asked', 'approval/decided']).flat())
  for (let i = 0; i < audit.length; i += 2) assert.equal(audit[i].data.id, audit[i + 1].data.id)
  assert.deepEqual(audit.filter(event => event.type === 'approval/decided').map(event => event.data.outcome), ['rejected', 'allowed-once', 'allowed-once'])
  record('approval-audit', { events: audit })
  agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  // Revoke after the pre-execution guard but before actual MCP dispatch.
  const delayed = ctx.on('tools/execute', async (exec, next) => {
    if (exec.callId === 'revoke-after-admission') denied = true
    return next()
  })
  await check('revoke-after-admission', mcpWrite, writeArgs('extends Node\n# admitted before revocation\n'), 'write')
  record('revocation-boundary', { verdict: 'OBSERVED: pre-dispatch admission does not atomically fence later write' })
  delayed()
  // The real MCP server is stateful: read-only config.set can redirect a later relative write.
  denied = false
  const switchResult = await call('switch-project', 'mcp__godot__config', { action: 'set', key: 'project_path', value: other })
  assert.equal(switchResult.isError, false, JSON.stringify(switchResult))
  await check('mcp-config-switch-write', mcpWrite, writeArgs('extends Node\n# redirected\n'), 'write', otherFile)
  record('mutable-mcp-scope', { verdict: 'OBSERVED: scripts.write relative paths follow MCP config; checking only session cwd is insufficient' })
  await call('restore-project', 'mcp__godot__config', { action: 'set', key: 'project_path', value: project })
  denied = true
  guard()
  await check('guard-unmounted', mcpWrite, writeArgs('extends Node\n# unmounted\n'), 'write')
  const restore = ctx.tools.guard(() => 'ISSUE24_DENY: all managed tools')
  await check('guard-restored', mcpWrite, writeArgs('FORBIDDEN'), 'deny')
  const before = await hash(file)
  await promisify(execFile)(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1], "extends Node\\n# external CLI\\n")', file], { windowsHide: true })
  const after = await hash(file); assert.notEqual(before, after)
  record('external-cli-bypass', { before, after, verdict: 'OBSERVED' })
  restore()
  const fault = ctx.tools.guard(() => { throw Error('ISSUE24_POLICY_UNAVAILABLE') })
  const faultResult = await check('policy-exception', mcpWrite, writeArgs('FORBIDDEN'), 'deny')
  assert.match(JSON.stringify(faultResult), /ISSUE24_POLICY_UNAVAILABLE/)
  fault()
  const scoped = agent.ctx.tools.guard(exec => isWrite(exec) ? 'ISSUE24_DENY: agent scoped policy' : undefined)
  await check('scoped-owner-denied', mcpWrite, writeArgs('FORBIDDEN'), 'deny')
  const second = await ctx.agents.create({ sessionId: 'governance-other', meta: { cwd: other }, agentOptions: { provider: 'unconfigured', model: 'no-model-used' }, setup: agentCtx => ctx.agentPresets.mount(agentCtx, 'governance-probe').then(() => undefined) })
  try {
    const before = await hash(otherFile)
    const result = await ctx.tools.execute({ name: mcpWrite, arguments: writeArgs('extends Node\n# unrelated agent\n'), agent: second.agent, callId: 'other-agent', signal: new AbortController().signal })
    const after = await hash(otherFile)
    record('unrelated-agent-not-blocked', { before, after, result })
    assert.equal(result.isError, false, JSON.stringify(result)); assert.notEqual(before, after)
  } finally { await second.dispose() }
  const child = await ctx.agents.create({ sessionId: 'governance-child', parentAgent: agent, meta: { cwd: project }, agentOptions: { provider: 'unconfigured', model: 'no-model-used' }, setup: agentCtx => ctx.agentPresets.mount(agentCtx, 'governance-probe').then(() => undefined) })
  try {
    const before = await hash(file)
    const result = await ctx.tools.execute({ name: mcpWrite, arguments: writeArgs('extends Node\n# child write\n'), agent: child.agent, callId: 'child-agent', signal: new AbortController().signal })
    const after = await hash(file)
    record('child-agent-guard-inheritance', { before, after, result })
    // This is an observation: no assumption that parentAgent means a policy scope parent.
    if (result.isError) assert.equal(before, after)
    else assert.notEqual(before, after)
  } finally { await child.dispose() }
  scoped()
  await handle.dispose()
} catch (error) { fail = error; console.error(error) }
finally {
  for (const fork of forks.reverse()) { try { await fork.dispose() } catch (error) { console.error('cleanup', error); fail ??= error } }
  await writeFile(join(output, 'results.json'), JSON.stringify({ date: '2026-10-16', harness: require('@deepseek-ai/dsh/package.json').version, tools: require('@deepseek-ai/dsh-tools/package.json').version, node: process.version, fixture: relative(output, root), scope: 'real scoped Agent + provisioned preset MCP + sandboxed tool-fs; synthetic approval transport; no Desktop UI or full Profile boot', passed: !fail, failure: fail?.stack, rows }, null, 2))
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
if (fail) process.exitCode = 1
