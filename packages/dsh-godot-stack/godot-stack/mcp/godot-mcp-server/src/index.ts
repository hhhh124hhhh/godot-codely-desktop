#!/usr/bin/env node
/**
 * godot-mcp-server —— Godot MCP 主权聚合器（真·去重合并版）
 *
 * 设计（单一 McpServer / 单一注册 / 无前缀 / 统一 SDK ^1.30.0）：
 *  - 主干：better-godot-mcp 的 17 复合工具（纯文件解析路线，不需 Godot 二进制在场）
 *  - 补 coding-solo 独有工具：list_projects + export_mesh_library / get_uid / update_project_uids
 *  - 原生 image-gen：generate_sprite / generate_image（火山方舟文生图，移植自 cocos-mcp-bridge）
 *  - 已删除：coding-solo 冗余 10 工具 + Plan B 子进程代理（spawnUpstream / cs__ / better__ 前缀）
 *
 * 传输：stdio（默认），或 HTTP /mcp + Godot JSON /api（MCP_TRANSPORT=http）。
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { detectGodot, isVersionSupported, tryGetVersion } from './better/src/godot/detector.js'
import type { GodotConfig } from './better/src/godot/types.js'
import { registerTools } from './better/src/tools/registry.js'
import { createHttpServer } from './http-server.js'
import type { SovereignCtx } from './cs-unique/tools.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

/**
 * [godot-codely] 读取 auto_setup 持久化的 Godot 路径（<DSH_HOME>/.godot/godot-path.txt）
 * 深扫/自动下载的兜底来源：标准 detectGodot 找不到便携版时启用。
 */
function loadPersistedGodotPath(): string | null {
  try {
    const home = process.env.USERPROFILE || process.env.HOME || ''
    const dshHome = process.env.DSH_HOME || path.join(home, '.dsh')
    const p = path.join(dshHome, '.godot', 'godot-path.txt')
    if (!fs.existsSync(p)) return null
    const value = fs.readFileSync(p, 'utf8').trim()
    if (!value) return null
    const version = tryGetVersion(value, true)
    if (version && isVersionSupported(version)) return value
  } catch {
    /* 持久化不可读时忽略 */
  }
  return null
}

export interface GodotMcpConfig {
  host: string
  port: number
  godotPath: string
  godotProjectPath: string
  volcArkApiKey: string
}

function loadConfig(): GodotMcpConfig {
  const configPath = path.join(ROOT, 'godot-mcp-server.config.json')
  let fileConfig: any = {}
  if (fs.existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    } catch (_) {
      fileConfig = {}
    }
  }
  const num = (v: any, d: number) => (Number.isInteger(v) ? v : d)
  return {
    host: process.env.GODOT_MCP_HOST || fileConfig.host || '127.0.0.1',
    port: num(process.env.GODOT_MCP_PORT || fileConfig.port, 8785),
    godotPath: process.env.GODOT_PATH || fileConfig.godotPath || '',
    godotProjectPath: process.env.GODOT_PROJECT_PATH || fileConfig.godotProjectPath || process.cwd(),
    volcArkApiKey: process.env.VOLC_ARK_API_KEY || fileConfig.volcArkApiKey || '',
  }
}

const CONFIG = loadConfig()

function buildSovereignCtx(): SovereignCtx {
  return {
    godotPath: CONFIG.godotPath || null,
    scriptPath: path.join(ROOT, 'src', 'godot-scripts', 'godot_operations.gd'),
    volcArkApiKey: CONFIG.volcArkApiKey,
    godotProjectPath: CONFIG.godotProjectPath,
  }
}

async function main(): Promise<void> {
  // 检测 Godot 二进制（better 路线；无则仅文件解析类工具可用，godot 进程类工具需二进制）
  // 优先级：标准检测 → auto_setup 持久化路径 → config.json / GODOT_PATH env
  const detection = detectGodot()
  const persistedPath = detection?.path ? null : loadPersistedGodotPath()
  const godotPath = detection?.path ?? persistedPath ?? (CONFIG.godotPath || null)
  if (godotPath) {
    console.error(`[godot-mcp-server] Godot detected: ${godotPath}`)
  } else {
    console.error(
      '[godot-mcp-server] Godot 未检测到（GODOT_PATH 未设）。文件解析类工具可用；' +
        'godot 进程类工具（export_mesh_library/get_uid/update_project_uids）需 Godot 二进制。',
    )
  }

  const config: GodotConfig = {
    godotPath,
    godotVersion: detection?.version ?? null,
    projectPath: CONFIG.godotProjectPath,
    activePids: [],
  }

  const server = new Server(
    { name: 'godot-mcp-server', version: '2.0.0' },
    { capabilities: { tools: {} } },
  )

  // 单一注册：better 17 复合工具 + coding-solo 4 独有工具 + image-gen 2 原生工具（无前缀）
  registerTools(server, config, buildSovereignCtx())

  console.error('[godot-mcp-server] 工具注册完成（better 主干 + cs-unique + image-gen，单 Server 无前缀）')

  const transportType = process.env.MCP_TRANSPORT || 'stdio'

  if (transportType === 'http') {
    const httpServer = createHttpServer(config, buildSovereignCtx())

    httpServer.listen(CONFIG.port, CONFIG.host, () => {
      console.error(`[godot-mcp-server] HTTP 端点已起: http://${CONFIG.host}:${CONFIG.port}/mcp (Godot JSON: /api)`)
    })
  } else {
    const stdioTransport = new StdioServerTransport()
    await server.connect(stdioTransport)
    console.error('[godot-mcp-server] stdio 传输已连接')
  }
}

main().catch((e) => {
  console.error('[godot-mcp-server] 启动失败:', e)
  process.exit(1)
})
