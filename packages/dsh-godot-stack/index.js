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
import { cp, mkdir, readFile, writeFile, access, stat } from 'node:fs/promises'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import z from '@deepseek-ai/schemastery'
import { BridgeServer } from './bridge/bridge.mjs'

const here = dirname(fileURLToPath(import.meta.url))

export const name = 'dsh-godot-stack'
export const inject = []
export const Config = z.object({})

function dshHome() {
  // 桌面端由 src/main/index.ts 为 harness 进程设置 DSH_HOME=<userData>\harness；
  // CLI/headless（dsh 启动器）未设时按 DSH 官方约定落在 ~/.dsh。
  // 不要自作主张探测 %APPDATA%\dsh-desktop：CLI 环境下该目录存在会误判形态。
  if (process.env.DSH_HOME) return process.env.DSH_HOME
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
  // 就绪判定 + 增量复制：目标已构建且依赖在位、源未更新时跳过复制，
  // 避免每次启动全量拷贝 node_modules（几十 MB / 数千文件）拖垮 boot 导致插件超时。
  const srcRoot = join(here, 'godot-stack', 'mcp', 'godot-mcp-server')
  const srcBuilt = join(srcRoot, 'build', 'index.js')
  const dstBuilt = join(target, 'build', 'index.js')
  const dstReady =
    (await exists(dstBuilt)) && (await exists(join(target, 'node_modules', '@modelcontextprotocol')))
  const srcNewer =
    (await exists(srcBuilt)) &&
    (!(await exists(dstBuilt)) || (await stat(srcBuilt)).mtimeMs > (await stat(dstBuilt)).mtimeMs)
  if (!dstReady || srcNewer) {
    await mkdir(join(home, '.godot'), { recursive: true })
    await cp(srcRoot, target, {
      recursive: true,
      force: true,
      // 只复制源码与 build 产物；node_modules 现场安装（asar 内本就不含依赖，force 复制不删目标已有依赖）
      // 注意：fs.cp 的 filter 在 Windows 上可能收到正斜杠路径，必须同时匹配两种分隔符
      filter: (src) =>
        !src.includes(`${sep}node_modules${sep}`) &&
        !src.includes('/node_modules/') &&
        !src.endsWith(`${sep}node_modules`) &&
        !src.endsWith('/node_modules'),
    })
  }
  if (!(await exists(dstBuilt))) {
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
      args: [dstBuilt],
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
    // MCP 复制在 provisionMcp 内部完成（增量 + 排除 node_modules，避免每次启动全量拷贝几十 MB 依赖）。
    // 这里不再做全量 cp——否则 npm install 后的源目录会把 node_modules 一起拷过去，拖垮 boot。
    const mcpTarget = join(home, '.godot', 'mcp-server')
    const mcp = await provisionMcp(home, mcpTarget)
    ctx.logger?.info?.('godot-stack: mcp provisioned; status=%s', mcp.status)
    if (mcp.status === 'source-only') {
      ctx.logger?.warn?.('godot-stack: %s', mcp.hint)
    }
  } catch (error) {
    ctx.logger?.warn?.('godot-stack: mcp provisioning skipped: %s', error?.message ?? String(error))
  }

  // Godot bridge：面板连的 REST 服务，只在桌面端形态启动（headless CLI 不需要）。
  // 判定：桌面端 harness 进程由主进程注入 DSH_HOME=<userData>\harness；CLI 无 DSH_HOME。
  const isDesktopHome = !!process.env.DSH_HOME && home.startsWith(join(process.env.APPDATA ?? '', 'dsh-desktop'))
  if (isDesktopHome) {
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
  } else {
    ctx.logger?.info?.('godot-stack: bridge skipped (headless home=%s)', home)
  }

  // 斜杠命令（桌面端/Web 会话 UI，对标 cowork /command 面）：确定性动作，不产生模型消息。
  // ctx.inject 动态注入：headless 无 commands 服务时静默跳过，不影响 CLI 启动。
  ctx.inject(['commands'], (commandCtx) => {
    const memDir = join(home, 'memories')
    const listMem = () => {
      if (!existsSync(memDir)) return []
      try {
        return readdirSync(memDir).sort()
      } catch {
        return []
      }
    }
    commandCtx.commands.register({
      name: 'memory',
      description: 'Godot Codely 长期记忆：记/查/列表',
      input: { hint: '<记 topic 内容 | 查 topic | 列表>' },
      handler: ({ rawInput }) => {
        const parts = rawInput.trim().split(/\s+/)
        const sub = parts[0]
        if (sub === '记') {
          const topic = parts[1]
          const content = parts.slice(2).join(' ')
          if (!topic || !content) return { kind: 'error', text: '用法：/memory 记 <topic> <内容>' }
          mkdirSync(memDir, { recursive: true })
          writeFileSync(join(memDir, topic + '.md'), content + '\n', 'utf8')
          return { kind: 'success', text: `已记忆 ${topic}（${content.length} 字）` }
        }
        if (sub === '查') {
          const topic = parts[1]
          if (!topic) return { kind: 'error', text: '用法：/memory 查 <topic>' }
          const f = join(memDir, topic + '.md')
          if (!existsSync(f)) return { kind: 'success', text: `未找到记忆「${topic}」（/memory 列表 查看全部）` }
          return { kind: 'success', text: `【记忆: ${topic}】\n${readFileSync(f, 'utf8').trim()}` }
        }
        if (sub === '列表') {
          const files = listMem()
          if (files.length === 0) return { kind: 'success', text: '记忆库为空（/memory 记 <topic> <内容>）' }
          return { kind: 'success', text: files.map((f) => `- ${f.replace(/\.md$/, '')}`).join('\n') }
        }
        return { kind: 'error', text: '/memory 子命令：记 | 查 | 列表' }
      },
    })
    commandCtx.commands.register({
      name: 'status',
      description: 'Godot Codely 能力进度与记忆概览',
      handler: () => {
        const agents = join(home, 'AGENTS.md')
        let status = ''
        if (existsSync(agents)) {
          const lines = readFileSync(agents, 'utf8')
            .split(/\r?\n/)
            .filter((l) => /✅|⏳|未完成|^- .*#/.test(l))
          status = lines.slice(0, 15).join('\n')
        }
        return { kind: 'success', text: `能力进度：\n${status || '（无 AGENTS.md）'}\n记忆：${listMem().length} 个主题` }
      },
    })
    ctx.logger?.info?.('godot-stack: slash commands registered (memory/status)')
  })
}
