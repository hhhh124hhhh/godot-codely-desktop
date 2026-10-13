/**
 * dsh-godot-stack - Godot Codely provisioning plugin.
 *
 * On boot it copies the bundled Godot stack into the DSH home:
 *   - agent-presets/godot-codely-lite and the three expert presets
 *     -> <dshHome>/.agent-presets/<name>
 *   - godot-mcp-server                 -> <dshHome>/.godot/mcp-server
 * and, when the generated MCP runtime passes integrity validation, registers it as mcpServers.godot
 * in <dshHome>/settings.json (without overriding an existing user config).
 *
 * It also starts the Godot bridge (bridge/bridge.mjs): a tiny REST server the
 * Godot editor panel talks to (create sessions, prompt, poll events), which in
 * turn calls the DSH Typert API on 127.0.0.1:43129.
 *
 * Expert presets are copied beside godot-codely-lite. Memories use ~/.dsh/memories
 * even when DSH_HOME points at the desktop harness directory.
 *
 * All provisioning is best-effort: failures only log a warning and never
 * block the Harness boot.
 */
import { cp, mkdir } from 'node:fs/promises'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import z from '@deepseek-ai/schemastery'
import { BridgeServer } from './bridge/bridge.mjs'
import { provisionOcuGateway } from './godot-stack/ocu-gateway/ocu-runtime.mjs'
import { provisionMcpRuntime } from './mcp-runtime.mjs'
import { adoptLegacyMemories, memoryRoot, sanitizeTopic } from './memory-root.mjs'

const here = dirname(fileURLToPath(import.meta.url))

export const name = 'dsh-godot-stack'
export const inject = []
export const Config = z.object({ bridge: z.boolean().default(false) })

function dshHome() {
  // 桌面端由 src/main/index.ts 为 harness 进程设置 DSH_HOME=<userData>\harness；
  // CLI/headless（dsh 启动器）未设时按 DSH 官方约定落在 ~/.dsh。
  // 不要自作主张探测 %APPDATA%\dsh-desktop：CLI 环境下该目录存在会误判形态。
  if (process.env.DSH_HOME) return process.env.DSH_HOME
  return join(os.homedir(), '.dsh')
}

const PRESET_NAMES = [
  'godot-codely-lite',
  'godot-scene-expert',
  'godot-shader-expert',
  'godot-gdscript-expert',
]

export async function provisionGodotPresets(home) {
  await mkdir(join(home, '.agent-presets'), { recursive: true })
  for (const name of PRESET_NAMES) {
    await cp(
      join(here, 'godot-stack', 'agent-presets', name),
      join(home, '.agent-presets', name),
      { recursive: true, force: true },
    )
  }
}

export async function apply(ctx, config = {}) {
  const home = dshHome()
  // Refresh only our tiny proxy; native OCU installation is an explicit setup step.
  try {
    await provisionOcuGateway(home)
  } catch (error) {
    ctx.logger?.warn?.('godot-stack: OCU gateway provisioning failed: %s', error?.message ?? String(error))
  }
  // 分段 best-effort：preset 与 MCP 互不拖累（asar 内目录 cp 可能因 Electron 文件系统兼容失败）
  try {
    await provisionGodotPresets(home)
    ctx.logger?.info?.('godot-stack: preset provisioned; home=%s', home)
  } catch (error) {
    ctx.logger?.warn?.('godot-stack: preset provisioning skipped: %s', error?.message ?? String(error))
  }
  try {
    // MCP 复制在 provisionMcpRuntime 内部完成（增量 + 排除 node_modules，避免每次启动全量拷贝几十 MB 依赖）。
    // 这里不再做全量 cp——否则 npm install 后的源目录会把 node_modules 一起拷过去，拖垮 boot。
    const mcpTarget = join(home, '.godot', 'mcp-server')
    const mcp = await provisionMcpRuntime(join(here, 'godot-stack/mcp/godot-mcp-server/runtime'), home, mcpTarget)
    ctx.logger?.info?.('godot-stack: mcp provisioned; status=%s', mcp.status)
  } catch (error) {
    ctx.logger?.warn?.('godot-stack: mcp provisioning skipped: %s', error?.message ?? String(error))
  }

  // Godot bridge：面板连的 REST 服务，只在桌面端形态启动（headless CLI 不需要）。
  // 判定：桌面端 harness 进程由主进程注入 DSH_HOME=<userData>\harness；CLI 无 DSH_HOME。
  const isDesktopHome = config.bridge === true
  if (isDesktopHome) {
    const dshPort = Number(process.env.DSH_HARNESS_PORT ?? process.env.GODOT_CODELY_DSH_PORT ?? 43129)
    const bridge = new BridgeServer({
      port: Number(process.env.GODOT_CODELY_BRIDGE_PORT ?? 4399),
      dshPort,
      tokenFile: join(home, 'godot-codely-launch-token'),
      logger: ctx.logger,
    })
    try {
      await bridge.start()
      ctx.on('approval/request', (request, next) => bridge.approval(request, next), { global: true })
      ctx.on('agent/assistant-stream', payload => bridge.assistantStream(payload), { global: true })
      ctx.logger?.info?.('godot-stack: bridge started on :%d -> dsh :%d', bridge.port, dshPort)
      ctx.on('dispose', () => bridge.stop())
    } catch (error) {
      ctx.logger?.warn?.('godot-stack: bridge start failed: %s', error?.message ?? String(error))
    }
  } else {
    ctx.logger?.info?.('godot-stack: bridge skipped (headless home=%s)', home)
  }

  // 斜杠命令（桌面端/Web 会话 UI，对标 cowork /command 面）：确定性动作，不产生模型消息。
  // ctx.inject 动态注入：headless 无 commands 服务时静默跳过，不影响 CLI 启动。
  ctx.inject(['commands'], (commandCtx) => {
    const memDir = adoptLegacyMemories() || memoryRoot()
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
          const topic = sanitizeTopic(parts[1] ?? '')
          const content = parts.slice(2).join(' ')
          if (!topic || !content) return { kind: 'error', text: '用法：/memory 记 <topic> <内容>（topic 不能含路径）' }
          mkdirSync(memDir, { recursive: true })
          const file = join(memDir, topic + '.md')
          if (existsSync(file)) writeFileSync(file + '.bak', readFileSync(file, 'utf8'), 'utf8')
          writeFileSync(file, content + '\n', 'utf8')
          return { kind: 'success', text: `已记忆 ${topic}（${content.length} 字）` }
        }
        if (sub === '查') {
          const topic = sanitizeTopic(parts[1] ?? '')
          if (!topic) return { kind: 'error', text: '用法：/memory 查 <topic>（topic 不能含路径）' }
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
