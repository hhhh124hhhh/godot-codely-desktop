#!/usr/bin/env node
/**
 * Godot Codely CLI —— DSH headless profile 的品牌化启动器（B 方案）。
 *
 * 形态对标 Tuanjie Cowork 的 codely CLI：独立进程、headless 内核、
 * 单次任务（one-shot），模型可由用户切换，不依赖桌面端运行。
 *
 * 用法：
 *   godot-codely "把 player.gd 的跳跃力度改成 400"     # 默认模型单次任务
 *   godot-codely --model glm-5.2 "分析场景树"          # 指定模型
 *   godot-codely --provider volcengine --model glm-latest "..."   # 跨 provider 同名时精确指定
 *   godot-codely --list-models                          # 列出可换模型
 *   godot-codely --profile web ...                      # 透传 dsh 的 profile 参数
 *
 * 模型路由原理：llm-pi-ai providers 全部注册在 profile 的 cordis.patch.yml；
 * --model/--provider 生成一个临时 overlay patch（agent-default-model），
 * 通过 dsh 的 --patch 机制覆盖默认模型，仅本次运行生效。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { runCli } from '@deepseek-ai/dsh/lib/bin.js'

const PROFILE = 'godot-codely'
const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profileDir = join(home, 'profiles', PROFILE)
const profilePatch = join(profileDir, 'cordis.patch.yml')

/** 从 profile cordis.patch.yml 枚举 provider -> [modelIds]，无 YAML 依赖的行级解析。 */
function listModels() {
  const providers = new Map() // name -> { displayName, models: [] }
  const lines = readFileSync(profilePatch, 'utf8').split(/\r?\n/)
  let cur = null
  for (const line of lines) {
    const pm = line.match(/^ {6}([A-Za-z0-9_.-]+):\s*$/)
    if (pm) {
      const name = pm[1]
      if (!providers.has(name)) providers.set(name, { displayName: name, models: [] })
      cur = name
      continue
    }
    if (!cur) continue
    const dm = line.match(/^ {8}displayName:\s*(.+)$/)
    if (dm) { providers.get(cur).displayName = dm[1].trim(); continue }
    const mm = line.match(/^ {10}- id:\s*(.+)$/)
    if (mm) { providers.get(cur).models.push(mm[1].trim()); continue }
  }
  return providers
}

const argv = process.argv.slice(2)
const first = argv[0]

// --list-models：枚举并退出
if (argv.includes('--list-models')) {
  const providers = listModels()
  console.log(`\x1b[36mGodot Codely CLI\x1b[0m · 可换模型\n`)
  const rows = []
  for (const [name, info] of providers) {
    for (const id of info.models) rows.push([name, info.displayName, id])
  }
  const w = Math.max(...rows.map((r) => r[0].length))
  for (const [name, display, id] of rows) {
    console.log(`  ${name.padEnd(w)}  ${id}  (${display})`)
  }
  console.log(`\n用法：godot-codely --model <id> "任务"  或  --provider <name> --model <id> "任务"`)
  process.exit(0)
}

// 解析 --model / --provider（仅限本命令自有参数，紧跟在命令名后）
let modelId = null
let providerName = null
const rest = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--model' || a === '-m') { modelId = argv[++i]; continue }
  if (a === '--provider') { providerName = argv[++i]; continue }
  rest.push(a)
}

// 模型名 -> provider 解析
let patchFile = null
if (modelId) {
  const providers = listModels()
  const candidates = [...providers.entries()].filter(([, info]) => info.models.includes(modelId))
  let resolvedProvider = providerName
  if (candidates.length === 0) {
    console.error(`\x1b[31mgodot-codely\x1b[0m: 未知模型 "${modelId}"；用 --list-models 查看可换模型`)
    process.exit(2)
  }
  if (candidates.length > 1 && !resolvedProvider) {
    console.error(`\x1b[31mgodot-codely\x1b[0m: 模型 "${modelId}" 存在于多个 provider（${candidates.map(([n]) => n).join(' / ')}），请用 --provider 指定`)
    process.exit(2)
  }
  resolvedProvider = resolvedProvider ?? candidates[0][0]
  if (![...providers.keys()].includes(resolvedProvider)) {
    console.error(`\x1b[31mgodot-codely\x1b[0m: 未知 provider "${resolvedProvider}"`)
    process.exit(2)
  }
  patchFile = join(profileDir, '.model-override.yml')
  writeFileSync(patchFile, `- id: agent-default-model\n  config:\n    provider: ${resolvedProvider}\n    model: ${modelId}\n`, 'utf8')
  console.log(`\x1b[36mGodot Codely CLI\x1b[0m · model=${modelId} (${resolvedProvider}) · headless`)
} else {
  console.log(`\x1b[36mGodot Codely CLI\x1b[0m · profile=${PROFILE} · headless`)
}

// 组装 dsh 参数
const bootArgs = ['--profile', PROFILE]
if (patchFile) bootArgs.push('--patch', patchFile)
process.argv = [process.argv[0], process.argv[1], ...bootArgs, ...rest]

await runCli({}).catch((error) => {
  console.error(`\x1b[31mgodot-codely\x1b[0m: ${error.message}`)
  process.exitCode = 1
})
