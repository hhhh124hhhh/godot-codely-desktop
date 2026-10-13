import { join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync } from 'node:fs'
import { scopeOf } from '@deepseek-ai/dsh-scope'
import * as mcpClient from '@deepseek-ai/dsh-mcp-client'

export const name = 'godot-agent-mcp'
export const inject = ['tools']

/** One MCP subprocess per Agent: config.set in one project cannot redirect another session. */
/** @param {string} cwd @param {string} [home] */
export function mcpAgentConfig(cwd, home = process.env.DSH_HOME || join(homedir(), '.dsh')) {
  if (typeof cwd !== 'string' || !cwd) throw Error('Godot MCP requires an Agent session cwd')
  const entry = join(home, '.godot/mcp-server/build/index.js')
  if (!existsSync(entry)) throw Error('Godot MCP runtime is not provisioned; restart with dsh-godot-stack enabled')
  return {
    serverName: 'godot', transport: 'stdio', command: process.execPath, args: [entry], cwd,
    env: { DSH_HOME: home, GODOT_PROJECT_PATH: cwd, MCP_TRANSPORT: 'stdio', ELECTRON_RUN_AS_NODE: '1' },
    failOnStartupError: true, toolCallTimeoutMs: 90000,
  }
}

export async function apply(ctx) {
  const owner = scopeOf(ctx)
  if (owner?.session?.header?.cwd) {
    await ctx.plugin(mcpClient, mcpAgentConfig(owner.session.header.cwd))
    return
  }
  if (!owner) throw Error('Godot MCP must be loaded in a scoped Agent preset')
  // Presets mount once as standing revisions before any Agent exists. Their scoped
  // listeners see only descendants joined to that revision, not other presets.
  const connections = new WeakMap()
  const connect = agent => {
    const key = scopeOf(agent.ctx)
    let ready = connections.get(key)
    if (!ready) {
      ready = (async () => { await agent.ctx.plugin(mcpClient, mcpAgentConfig(agent.session.header.cwd)) })()
      connections.set(key, ready)
    }
    return ready
  }
  ctx.on('agent/created', ({ agent }) => connect(agent))
  ctx.on('agent/pre-step', async ({ agent }, next) => { await connect(agent); return next() })
}
