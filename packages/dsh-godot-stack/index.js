/**
 * dsh-godot-stack - Godot Codely provisioning plugin.
 *
 * On boot it copies the bundled Godot stack into the DSH home:
 *   - agent-presets/godot-codely-lite  -> <dshHome>/.agent-presets/godot-codely-lite
 *   - godot-mcp-server                 -> <dshHome>/.godot/mcp-server
 * and, when the MCP server has been built, registers it as mcpServers.godot
 * in <dshHome>/settings.json (without overriding an existing user config).
 *
 * It also starts the Godot bridge (bridge/bridge.mjs): a tiny REST server the
 * Godot editor panel talks to (create sessions, prompt, poll events), which in
 * turn calls the DSH Typert API on 127.0.0.1:43129.
 *
 * The bundled skills under ./skills are discovered by the DSH skill system
 * as bundled plugin skills (same mechanism as dsh-image-generation).
 *
 * All provisioning is best-effort: failures only log a warning and never
 * block the Harness boot.
 */
import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import z from '@deepseek-ai/schemastery'
import { BridgeServer } from './bridge/bridge.mjs'

const here = dirname(fileURLToPath(import.meta.url))

export const name = 'dsh-godot-stack'
export const inject = []
export const Config = z.object({})

function dshHome() {
  if (process.env.DSH_HOME) return process.env.DSH_HOME
  // 桌面端把 userData 硬编码为 %APPDATA%\dsh-desktop（src/main/index.ts），
  // dshHome = <userData>\harness。主进程环境没有 DSH_HOME，这里显式探测。
  const appDataHome = join(process.env.APPDATA ?? '', 'dsh-desktop', 'harness')
  if (appDataHome !== join('', 'dsh-desktop', 'harness') && existsSync(appDataHome)) {
    return appDataHome
  }
  return join(os.homedir(), '.dsh')
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function provisionMcp(home, target) {
  const builtEntry = join(target, 'build', 'index.js')
  if (!(await exists(builtEntry))) {
    return { status: 'source-only', hint: `run "npm install && npm run build" inside ${target} then restart` }
  }
  const settingsPath = join(home, 'settings.json')
  let settings = {}
  try {
    settings = JSON.parse(await readFile(settingsPath, 'utf8'))
  } catch {
    settings = {}
  }
  settings.mcpServers = settings.mcpServers ?? {}
  if (!settings.mcpServers.godot) {
    settings.mcpServers.godot = {
      command: 'node',
      args: [builtEntry],
      env: {}
    }
    await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8')
  }
  return { status: 'configured' }
}

async function provisionPreset(home) {
  await mkdir(join(home, '.agent-presets'), { recursive: true })
  await cp(
    join(here, 'godot-stack', 'agent-presets', 'godot-codely-lite'),
    join(home, '.agent-presets', 'godot-codely-lite'),
    { recursive: true, force: true }
  )
}

export async function apply(ctx) {
  const home = dshHome()
  // 分段 best-effort：preset 与 MCP 互不拖累（asar 内目录 cp 可能因 Electron 文件系统兼容失败）
  try {
    await provisionPreset(home)
    ctx.logger?.info?.('godot-stack: preset provisioned; home=%s', home)
  } catch (error) {
    ctx.logger?.warn?.('godot-stack: preset provisioning skipped: %s', error?.message ?? String(error))
  }
  try {
    const mcpTarget = join(home, '.godot', 'mcp-server')
    await mkdir(join(home, '.godot'), { recursive: true })
    await cp(join(here, 'godot-stack', 'mcp', 'godot-mcp-server'), mcpTarget, { recursive: true, force: true })
    const mcp = await provisionMcp(home, mcpTarget)
    ctx.logger?.info?.('godot-stack: mcp provisioned; status=%s', mcp.status)
    if (mcp.status === 'source-only') {
      ctx.logger?.warn?.('godot-stack: %s', mcp.hint)
    }
  } catch (error) {
    ctx.logger?.warn?.('godot-stack: mcp provisioning skipped: %s', error?.message ?? String(error))
  }

  // Godot bridge：面板连的 REST 服务。DSH harness 端口默认 43129（dev 构建 43130）。
  // tokenFile 必须与 harness-runtime 落盘路径一致：<dshHome>/godot-codely-launch-token
  const dshPort = Number(process.env.DSH_HARNESS_PORT ?? process.env.GODOT_CODELY_DSH_PORT ?? 43129)
  const bridge = new BridgeServer({
    port: Number(process.env.GODOT_CODELY_BRIDGE_PORT ?? 4399),
    dshPort,
    tokenFile: join(home, 'godot-codely-launch-token'),
    logger: ctx.logger,
  })
  try {
    bridge.start()
    ctx.logger?.info?.('godot-stack: bridge started on :%d -> dsh :%d', bridge.port, dshPort)
    ctx.on('dispose', () => {
      bridge.stop()
    })
  } catch (error) {
    ctx.logger?.warn?.('godot-stack: bridge start failed: %s', error?.message ?? String(error))
  }
}
