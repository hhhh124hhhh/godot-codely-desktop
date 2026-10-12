/**
 * Config tool - Server configuration, environment detection, and verification
 * Actions: status | set | detect_godot | check | auto_setup | state
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { detectGodot, isExecutable, isVersionSupported, scanGodotCommon, tryGetVersion } from '../../godot/detector.js'
import type { GodotConfig } from '../../godot/types.js'
import { formatJSON, formatSuccess, GodotMCPError, throwUnknownAction } from '../helpers/errors.js'
import { pathExists } from '../helpers/paths.js'

// Mutable runtime config
const runtimeConfig: Record<string, string> = {}

/**
 * Get current configuration status.
 */
async function handleStatus(_args: Record<string, unknown>, config: GodotConfig) {
  return formatJSON({
    godot_path: config.godotPath || 'not detected',
    godot_version: config.godotVersion?.raw || 'unknown',
    project_path: config.projectPath || 'not set',
    runtime_overrides: runtimeConfig,
  })
}

/**
 * Set a configuration value.
 */
async function handleSet(args: Record<string, unknown>, config: GodotConfig) {
  const key = args.key as string
  const value = args.value as string

  if (!key) {
    throw new GodotMCPError('No key specified', 'INVALID_ARGS', 'Provide key to set (e.g., project_path).')
  }
  if (value === undefined || value === null) {
    throw new GodotMCPError('No value specified', 'INVALID_ARGS', 'Provide value for the key.')
  }

  const validKeys = ['project_path', 'godot_path', 'timeout']
  if (!validKeys.includes(key)) {
    throw new GodotMCPError(`Invalid config key: ${key}`, 'INVALID_ARGS', `Valid keys: ${validKeys.join(', ')}`)
  }

  // Validate paths don't contain shell metacharacters and don't start with hyphen
  // Note: backslash (\) is allowed since it's the Windows path separator
  // and we use spawnSync/spawn (not shell exec), so it's not a security risk
  if (
    (key === 'project_path' || key === 'godot_path') &&
    (typeof value !== 'string' || /[;&|`$(){}<>'"\0\n\r]/.test(value) || value.trim().startsWith('-'))
  ) {
    throw new GodotMCPError(
      `Invalid characters or format in ${key}`,
      'INVALID_ARGS',
      'Path must not contain shell metacharacters and must not start with a hyphen.',
    )
  }

  // Validate before updating runtimeConfig to avoid storing invalid values
  if (key === 'project_path') {
    if (!(await pathExists(join(value, 'project.godot')))) {
      throw new GodotMCPError(
        'Invalid project path',
        'INVALID_ARGS',
        `The path '${value}' does not contain a 'project.godot' file.`,
      )
    }
    config.projectPath = value
  } else if (key === 'godot_path') {
    if (!isExecutable(value)) {
      throw new GodotMCPError('Invalid Godot path', 'INVALID_ARGS', `The path '${value}' is not an executable file.`)
    }
    const version = tryGetVersion(value)
    if (!version) {
      throw new GodotMCPError(
        'Invalid Godot binary',
        'INVALID_ARGS',
        `The file at '${value}' is not a valid Godot binary or failed to return version information.`,
      )
    }
    if (!isVersionSupported(version)) {
      throw new GodotMCPError(
        'Unsupported Godot version',
        'INVALID_ARGS',
        `Godot version ${version.raw} is not supported. Minimum required version is 4.1.`,
      )
    }
    config.godotPath = value
    config.godotVersion = version
  }

  // Only persist to runtimeConfig after all validation passes
  runtimeConfig[key] = value

  return formatSuccess(`Config updated: ${key} = ${value}`)
}

/**
 * Detect Godot installation on the system.
 * [sovereign] 优先用已配置的 godotPath（config.json / GODOT_PATH env），
 * 避免"工具能用 Godot 但 detect_godot 报 not found"的不一致。
 */
async function handleDetectGodot(_args: Record<string, unknown>, config: GodotConfig) {
  if (config.godotPath) {
    const version = tryGetVersion(config.godotPath, true)
    if (version) {
      return formatJSON({
        found: true,
        path: config.godotPath,
        version,
        source: 'config',
      })
    }
    return formatJSON({
      found: false,
      message: 'Configured Godot path is not usable',
      suggestions: [
        'Check godot-mcp-server.config.json godotPath field',
        'Or set GODOT_PATH environment variable to a valid Godot binary',
      ],
      configuredPath: config.godotPath,
    })
  }

  const result = detectGodot()
  if (!result) {
    return formatJSON({
      found: false,
      message: 'Godot not found on this system',
      suggestions: [
        'Install Godot from https://godotengine.org/download',
        'Set GODOT_PATH environment variable to your Godot binary',
        'Windows: winget install GodotEngine.GodotEngine',
        'macOS: brew install --cask godot',
        'Linux: snap install godot-4 or flatpak install org.godotengine.Godot',
      ],
    })
  }

  return formatJSON({
    found: true,
    path: result.path,
    version: result.version,
    source: result.source,
  })
}

/**
 * [godot-codely] auto_setup：自动定位 Godot（配置 → 标准检测 → 深度扫描），
 * 找不到则下载官方稳定版到 <DSH_HOME>/.godot/godot/ 并配置。
 * 可配：GODOT_SETUP_VERSION（默认 4.7.1-stable）、GODOT_MIRROR（下载镜像前缀，默认 GitHub 官方）。
 */
const DEFAULT_GODOT_VERSION = '4.7.1-stable'

/**
 * [godot-codely] 持久化 Godot 路径（<DSH_HOME>/.godot/godot-path.txt），
 * 供 server 下次启动直接读取（见 init-server.ts loadPersistedGodotPath）。
 */
function persistGodotPath(p: string): void {
  try {
    const home = process.env.USERPROFILE || process.env.HOME || ''
    const dshHome = process.env.DSH_HOME || join(home, '.dsh')
    const dir = join(dshHome, '.godot')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'godot-path.txt'), p, 'utf8')
  } catch {
    /* 持久化失败不阻塞流程 */
  }
}

function godotDownloadUrl(version: string): string {
  const mirror = process.env.GODOT_MIRROR
  const asset = process.platform === 'win32'
    ? `Godot_v${version}_win64.exe.zip`
    : process.platform === 'darwin'
      ? `Godot_v${version}_macos.universal.zip`
      : `Godot_v${version}_linux.x86_64.zip`
  if (mirror) return `${mirror.replace(/\/$/, '')}/godotengine/godot/releases/download/${version}/Godot_v${version}-stable_win64.exe.zip`.replace('_win64', process.platform === 'win32' ? '_win64' : '_x86_64')
  return `https://github.com/godotengine/godot/releases/download/${version}/${asset}`
}

async function downloadWithFallback(urls: string[], dest: string): Promise<boolean> {
  for (const url of urls) {
    try {
      const resp = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(300_000) })
      if (!resp.ok) continue
      const buf = Buffer.from(await resp.arrayBuffer())
      if (buf.length < 10 * 1024 * 1024) continue // 有效 Godot zip 远大于 10MB
      writeFileSync(dest, buf)
      return true
    } catch {
      /* 尝试下一个镜像 */
    }
  }
  return false
}

async function installGodotDefault(): Promise<string | null> {
  const version = process.env.GODOT_SETUP_VERSION || DEFAULT_GODOT_VERSION
  const home = process.env.USERPROFILE || process.env.HOME || ''
  const dshHome = process.env.DSH_HOME || join(home, '.dsh')
  const destDir = join(dshHome, '.godot', 'godot')
  mkdirSync(destDir, { recursive: true })

  const zipPath = join(tmpdir(), `godot-${version}.zip`)
  const urls = [godotDownloadUrl(version)]
  // 备选：官方 TuxFamily 镜像（GitHub 不可达时）
  if (process.platform === 'win32') {
    urls.push(`https://downloads.tuxfamily.org/godotengine/${version}/Godot_v${version}-stable_win64.exe.zip`)
  }

  if (!(await downloadWithFallback(urls, zipPath))) return null
  if (!existsSync(zipPath)) return null

  try {
    // Windows 10+ 自带 bsdtar，可解 zip；失败则回退 PowerShell Expand-Archive
    try {
      execFileSync('tar', ['-xf', zipPath, '-C', destDir], { timeout: 120_000, stdio: 'pipe' })
    } catch {
      execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`], { timeout: 120_000, stdio: 'pipe' })
    }
    // 解压目录中找 exe
    for (const f of readdirSync(destDir)) {
      if (!/^Godot.*\.exe$/i.test(f) || /console/i.test(f)) continue
      const p = join(destDir, f)
      if (!isExecutable(p)) continue
      const ver = tryGetVersion(p)
      if (ver && isVersionSupported(ver)) return p
    }
  } catch {
    return null
  }
  return null
}

/**
 * [godot-codely] auto_setup：完整自举流程（配置 → 标准检测 → 深度扫描 → 下载安装）
 */
async function handleAutoSetup(_args: Record<string, unknown>, config: GodotConfig) {
  // 阶段 1：已配置的 godotPath
  if (config.godotPath) {
    const version = tryGetVersion(config.godotPath, true)
    if (version && isVersionSupported(version)) {
      return formatJSON({ found: true, path: config.godotPath, version, source: 'config' })
    }
  }
  // 阶段 2：标准检测（env/PATH/系统位置）
  const detected = detectGodot()
  if (detected) {
    config.godotPath = detected.path
    config.godotVersion = detected.version
    persistGodotPath(detected.path)
    return formatJSON({ found: true, path: detected.path, version: detected.version, source: detected.source })
  }
  // 阶段 3：深度扫描（便携位）
  const scanned = scanGodotCommon()
  if (scanned) {
    config.godotPath = scanned.path
    config.godotVersion = scanned.version
    persistGodotPath(scanned.path)
    return formatJSON({ found: true, path: scanned.path, version: scanned.version, source: scanned.source })
  }
  // 阶段 4：下载安装
  const installed = await installGodotDefault()
  if (installed) {
    const version = tryGetVersion(installed, true)
    config.godotPath = installed
    if (version) config.godotVersion = version
    persistGodotPath(installed)
    return formatJSON({
      found: true,
      path: installed,
      version: version || { major: 4, minor: 0, patch: 0, label: 'downloaded', raw: 'downloaded' },
      source: 'downloaded',
      note: '已自动下载 Godot 到 ' + installed + '（可用 GODOT_MIRROR 环境变量配置下载镜像）',
    })
  }
  return formatJSON({
    found: false,
    message: '未找到 Godot 且自动下载失败',
    suggestions: [
      '手动安装：https://godotengine.org/download 或 winget install GodotEngine.GodotEngine',
      '配置 GODOT_SETUP_VERSION / GODOT_MIRROR 环境变量后重试 auto_setup',
    ],
  })
}

/**
 * Check Godot and project status.
 */
async function handleCheck(_args: Record<string, unknown>, config: GodotConfig) {
  const detection = detectGodot()
  const projectPath = config.projectPath

  const status = {
    godot: detection ? { found: true, path: detection.path, version: detection.version.raw } : { found: false },
    project: projectPath
      ? {
          path: projectPath,
          // Performance optimization: using async pathExists instead of existsSync
          // to avoid blocking the Node.js event loop during I/O operations
          valid: await pathExists(join(projectPath, 'project.godot')),
        }
      : { path: null },
  }

  return formatJSON(status)
}

/**
 * 桌面端/CLI ↔ 编辑器插件状态同步：
 * 读取 <DSH_HOME>/.godot/state.json（Godot AI 面板连接成功后自动写入），
 * 合并 server 自身运行时状态，供 CLI/桌面端 agent 观察编辑器当前项目/场景。
 */
async function handleState(_args: Record<string, unknown>, config: GodotConfig) {
  let plugin: Record<string, unknown> | null = null
  try {
    const home = process.env.USERPROFILE || process.env.HOME || ''
    const dshHome = process.env.DSH_HOME || join(home, '.dsh')
    const p = join(dshHome, '.godot', 'state.json')
    if (existsSync(p)) {
      const parsed: unknown = JSON.parse(readFileSync(p, 'utf8'))
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Expected an editor state object')
      }
      plugin = parsed as Record<string, unknown>
    }
  } catch (error) {
    throw new GodotMCPError(
      'Cannot read editor state',
      'INVALID_ARGS',
      'Check the editor state file under DSH_HOME/.godot/state.json.',
      { cause: error instanceof Error ? error.message : String(error) },
    )
  }
  return formatJSON({
    godot_path: config.godotPath || 'not detected',
    godot_version: config.godotVersion?.raw || 'unknown',
    project_path: config.projectPath || 'not set',
    runtime_overrides: runtimeConfig,
    editor_plugin: plugin,
  })
}

const CONFIG_ACTIONS: Record<
  string,
  (
    args: Record<string, unknown>,
    config: GodotConfig,
  ) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>
> = {
  status: handleStatus,
  set: handleSet,
  detect_godot: handleDetectGodot,
  check: handleCheck,
  auto_setup: handleAutoSetup,
  state: handleState,
  setup_status: async () => formatJSON({ needs_setup: false, reason: 'godot-mcp has no credentials' }),
  setup_start: async () => formatSuccess('No setup required for godot-mcp.'),
  setup_reset: async () => formatSuccess('Nothing to reset.'),
  setup_complete: async () => formatSuccess('Already complete (no setup needed).'),
  setup_skip: async () => formatSuccess('Nothing to skip.'),
}

export async function handleConfig(action: string, args: Record<string, unknown>, config: GodotConfig) {
  if (Object.hasOwn(CONFIG_ACTIONS, action)) {
    const handler = CONFIG_ACTIONS[action]
    if (handler) {
      return handler(args, config)
    }
  }

  throwUnknownAction(action, Object.keys(CONFIG_ACTIONS))
}
