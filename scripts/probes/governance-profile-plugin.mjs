/** Actual Profile startup probe loaded by the normal Harness loader, never shipped. */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
export const name = 'issue24-profile-hook-probe'
export const inject = ['tools', 'agents', 'sandboxPolicy', 'approval', 'fs']
export async function apply(ctx) {
  const rows = []
  const file = join(process.env.ISSUE24_PROJECT, 'player.gd')
  const hash = async () => createHash('sha256').update(await readFile(file)).digest('hex')
  let handle
  let failure
  try {
    handle = await ctx.agents.create({ sessionId: 'profile-governance-probe', meta: { cwd: process.env.ISSUE24_PROJECT }, agentOptions: { provider: 'unconfigured', model: 'no-model-used' }, setup: async agentCtx => {
      const mcp = await import(process.env.ISSUE24_MCP_PLUGIN)
      await agentCtx.plugin(mcp)
    } })
    const agent = handle.agent
    assert.equal(ctx.sandboxPolicy.resolve({ session: agent.session }).mode, 'danger-full-access')
    assert.equal(ctx.approval.effectivePolicy(agent.session), 'never')
    const call = async (id, name, args, denied) => {
      const before = await hash()
      const result = await ctx.tools.execute({ name, arguments: args, agent, callId: id, signal: new AbortController().signal })
      const after = await hash()
      rows.push({ id, name, before, after, result })
      assert.equal(result.isError, denied, JSON.stringify(result))
      if (denied || id.includes('read')) assert.equal(before, after)
      else assert.notEqual(before, after)
      if (denied) assert.match(JSON.stringify(result), /ISSUE24_DENY/)
    }
    const scripts = 'mcp__godot__scripts'
    await call('profile-mcp-read', scripts, { action: 'read', script_path: 'res://player.gd' }, false)
    await call('profile-mcp-write', scripts, { action: 'write', script_path: 'res://player.gd', content: 'extends Node\n# profile allow\n' }, false)
    await call('profile-fs-read', 'read', { file_path: file }, false)
    await call('profile-fs-write', 'write', { file_path: file, content: 'extends Node\n# profile fs allow\n' }, false)
    const guard = ctx.tools.guard(exec => exec.name === 'write' || exec.name === scripts && exec.arguments.action === 'write' ? 'ISSUE24_DENY: real Profile policy' : undefined)
    const later = ctx.on('tools/pre-execute', async () => ({ kind: 'allow' }))
    try {
      await call('profile-mcp-deny', scripts, { action: 'write', script_path: 'res://player.gd', content: 'FORBIDDEN' }, true)
      await call('profile-fs-deny', 'write', { file_path: file, content: 'FORBIDDEN' }, true)
    } finally { later(); guard() }
  } catch (error) { failure = error.stack }
  finally {
    await handle?.dispose()
    await writeFile(process.env.ISSUE24_RECEIPT, JSON.stringify({ passed: !failure, failure, rows, permission: 'danger-full-access', approval: 'never' }, null, 2))
  }
}
