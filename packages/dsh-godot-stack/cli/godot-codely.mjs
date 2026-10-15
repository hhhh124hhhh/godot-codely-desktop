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
import { cliBrandLabel } from './brand.mjs'
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { runCli } from '@deepseek-ai/dsh/lib/bin.js'
import { cliHome } from '../data-home.mjs'

const PROFILE = 'godot-codely'
const home = cliHome()
// Harness itself defaults to ~/.dsh. Pin this process before boot so profiles
// and credentials stay in ~/.godot-codely instead of the upstream home.
if (!process.env.DSH_HOME?.trim()) process.env.DSH_HOME = home
const profileDir = join(home, 'profiles', PROFILE)
const profilePatch = join(profileDir, 'cordis.patch.yml')

/** 从 profile + home 级 cordis.patch.yml 枚举 provider -> [modelIds]，无 YAML 依赖的行级解析。 */
function listModels() {
  const providers = new Map() // name -> { displayName, models: [] }
  const sources = [profilePatch, join(home, 'cordis.patch.yml')]
  for (const file of sources) {
    if (!existsSync(file)) continue
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
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
  }
  return providers
}

const argv = process.argv.slice(2)
const first = argv[0]

// 自动记忆目录（供斜杠命令与任务内沉淀共用）
const memoryDir = join(home, 'memories')
const memorySnapshot = () => {
  if (!existsSync(memoryDir)) return []
  try {
    return readdirSync(memoryDir).sort()
  } catch {
    return []
  }
}

// ---- 斜杠命令：确定性动作，不启动模型（秒回，对标 cowork /command 面） ----
if (first?.startsWith('/')) {
  // 命令可能整体在第一个参数里（如 "/memory 记 topic 内容"），按空白拆出命令名与参数
  const [cmdWord, ...restOfFirst] = first.slice(1).split(/\s+/)
  const cmd = cmdWord.toLowerCase()
  const args = [...restOfFirst, ...argv.slice(1)]
  if (cmd === 'memory') {
    const sub = args[0]
    if (sub === '记') {
      const topic = args[1]
      const content = args.slice(2).join(' ')
      if (!topic || !content) {
        console.error(`\x1b[31mgodot-codely\x1b[0m: /memory 记 <topic> <内容>\n  示例：godot-codely "/memory 记 user_preferences 用户喜欢快"`)
        process.exit(2)
      }
      const f = join(memoryDir, topic + '.md')
      writeFileSync(f, content + '\n', 'utf8')
      console.log(`\x1b[36m已记忆\x1b[0m ${topic} -> ${f}`)
      process.exit(0)
    }
    if (sub === '查') {
      const topic = args[1]
      if (!topic) {
        console.error(`\x1b[31mgodot-codely\x1b[0m: /memory 查 <topic>`)
        process.exit(2)
      }
      const f = join(memoryDir, topic + '.md')
      if (!existsSync(f)) {
        console.log(`未找到记忆「${topic}」（可用 /memory 列表 查看全部主题）`)
        process.exit(0)
      }
      console.log(`【记忆: ${topic}】`)
      console.log(readFileSync(f, 'utf8').trim())
      process.exit(0)
    }
    if (sub === '列表') {
      const files = memorySnapshot()
      if (files.length === 0) {
        console.log('记忆库为空（可 /memory 记 <topic> <内容> 写入）')
        process.exit(0)
      }
      console.log(`记忆库目录：${memoryDir}`)
      for (const f of files) console.log(`- ${f.replace(/\.md$/, '')}`)
      process.exit(0)
    }
    console.error(`\x1b[31mgodot-codely\x1b[0m: /memory 子命令：记 | 查 | 列表`)
    process.exit(2)
  }
  if (cmd === 'models') {
    const providers = listModels()
    console.log(`\x1b[36m${cliBrandLabel()}\x1b[0m · 模型套餐\n`)
    for (const [name, info] of providers) {
      console.log(`  ${name}  (${info.displayName})`)
      for (const id of info.models) console.log(`    - ${id}`)
    }
    process.exit(0)
  }
  if (cmd === 'status') {
    console.log(`\x1b[36m${cliBrandLabel()}\x1b[0m · 能力进度（AGENTS.md 摘要）\n`)
    const agents = join(home, 'AGENTS.md')
    if (existsSync(agents)) {
      const txt = readFileSync(agents, 'utf8')
      const lines = txt.split(/\r?\n/).filter((l) => /^#|^[-*]|✅|⏳|未完成/.test(l))
      for (const l of lines.slice(0, 30)) console.log(l)
    } else {
      console.log('未找到全局 AGENTS.md')
    }
    console.log(`\n记忆条数：${memorySnapshot().length} 个主题`)
    process.exit(0)
  }
  console.error(`\x1b[31mgodot-codely\x1b[0m: 未知斜杠命令 /${cmd}（可用：/memory 记|查|列表、/models、/status）`)
  process.exit(2)
}

// ---- config 子命令：用户自建/查看模型套餐（对标 cowork 的模型市场体验） ----
if (first === 'config') {
  const sub = argv[1]
  if (sub === 'add') {
    const get = (flag) => {
      const i = argv.indexOf(flag)
      return i >= 0 ? argv[i + 1] : undefined
    }
    const name = get('--name')
    const baseURL = get('--base-url')
    const api = get('--api') ?? 'openai-completions'
    const keyEnv = get('--key-env')
    const key = get('--key')
    const models = get('--models')?.split(',').map((s) => s.trim()).filter(Boolean) ?? []
    const display = get('--display') ?? name
    if (!name || !baseURL || !keyEnv || !key || models.length === 0) {
      console.error(`\x1b[31mgodot-codely\x1b[0m: config add 需要 --name --base-url --key-env --key --models\n  示例：godot-codely config add --name my-plan --base-url https://api.example.com/v1 --api openai-completions --key-env MY_API_KEY --key sk-xxx --models m1,m2 --display "我的套餐" [--default]`)
      process.exit(2)
    }
    if (!['openai-completions', 'anthropic-messages'].includes(api)) {
      console.error(`\x1b[31mgodot-codely\x1b[0m: --api 仅支持 openai-completions | anthropic-messages`)
      process.exit(2)
    }
    // 1) 写入 home 级 patch（~/.godot-codely/cordis.patch.yml，DSH 自动应用到所有 profile）
    const homePatch = join(home, 'cordis.patch.yml')
    const providerBlock = [
      `- id: llm-pi-ai`,
      `  config:`,
      `    providers:`,
      `      ${name}:`,
      `        apiKeyEnv: ${keyEnv}`,
      `        displayName: ${display}`,
      `        api: ${api}`,
      `        baseURL: ${baseURL}`,
      `        models:`,
      ...models.map((m) => `          - id: ${m}`)
    ].join('\n')
    if (!existsSync(homePatch) || readFileSync(homePatch, 'utf8').trim() === '[]') {
      writeFileSync(homePatch, providerBlock + '\n', 'utf8')
    } else {
      const cur = readFileSync(homePatch, 'utf8')
      writeFileSync(homePatch, cur.trimEnd() + '\n' + providerBlock + '\n', 'utf8')
    }
    // 2) 写入 key（~/.godot-codely/.credentials.yaml 的 refs）
    const credPath = join(home, '.credentials.yaml')
    const cred = readFileSync(credPath, 'utf8')
    if (cred.includes(`\n  ${keyEnv}: `) || cred.includes(`  ${keyEnv}: `)) {
      const lines = cred.split(/\r?\n/).map((l) => (l.startsWith(`  ${keyEnv}: `) ? `  ${keyEnv}: ${key}` : l))
      writeFileSync(credPath, lines.join('\n'), 'utf8')
    } else {
      writeFileSync(credPath, cred.replace(/\nrecords:/, `\n  ${keyEnv}: ${key}\nrecords:`), 'utf8')
    }
    // 3) --default → 设为默认模型
    if (argv.includes('--default')) {
      const defPatch = join(profileDir, 'cordis.patch.yml')
      const dp = readFileSync(defPatch, 'utf8')
      const next = dp.replace(/- id: agent-default-model\n  config:\n    provider: .*\n    model: .*\n/, `- id: agent-default-model\n  config:\n    provider: ${name}\n    model: ${models[0]}\n`)
      writeFileSync(defPatch, next, 'utf8')
      console.log(`\x1b[36m${cliBrandLabel()}\x1b[0m · 套餐「${display}」已添加并设为默认（${name}/${models[0]}）`)
    } else {
      console.log(`\x1b[36m${cliBrandLabel()}\x1b[0m · 套餐「${display}」已添加（${name}，${models.length} 个模型）`)
    }
    console.log(`  可用：godot-codely --list-models 查看 ｜ godot-codely --model <id> "任务" 切换`)
    process.exit(0)
  }
  if (sub === 'list') {
    const providers = listModels()
    console.log(`\x1b[36m${cliBrandLabel()}\x1b[0m · 模型套餐\n`)
    for (const [name, info] of providers) {
      console.log(`  ${name}  (${info.displayName})`)
      for (const id of info.models) console.log(`    - ${id}`)
    }
    process.exit(0)
  }
  console.error(`\x1b[31mgodot-codely\x1b[0m: config 子命令：add（新增套餐）/ list（列出套餐）`)
  process.exit(2)
}

// --list-models：枚举并退出
if (argv.includes('--list-models')) {
  const providers = listModels()
  console.log(`\x1b[36m${cliBrandLabel()}\x1b[0m · 可换模型\n`)
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

// 解析 --model / --provider / --permission（仅限本命令自有参数，紧跟在命令名后）
let modelId = null
let providerName = null
let permissionMode = null
const rest = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--model' || a === '-m') { modelId = argv[++i]; continue }
  if (a === '--provider') { providerName = argv[++i]; continue }
  if (a === '--permission') { permissionMode = argv[++i]; continue }
  rest.push(a)
}

// 安全策略/协作模式：默认 danger-full-access（完全权限+无审批，CLI 能干重活）；
// 可 --permission workspace-write / read-only 降级（ask 审批，headless 无审批通道时写工作区外会 fail-closed）。
if (permissionMode) {
  if (!['read-only', 'workspace-write', 'danger-full-access'].includes(permissionMode)) {
    console.error(`\x1b[31mgodot-codely\x1b[0m: --permission 仅支持 read-only | workspace-write | danger-full-access`)
    process.exit(2)
  }
  process.env.DSH_PERMISSION_MODE = permissionMode
  console.log(`\x1b[36m${cliBrandLabel()}\x1b[0m · permission=${permissionMode}`)
} else {
  process.env.DSH_PERMISSION_MODE ??= 'danger-full-access'
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
  console.log(`\x1b[36m${cliBrandLabel()}\x1b[0m · model=${modelId} (${resolvedProvider}) · headless`)
} else {
  console.log(`\x1b[36m${cliBrandLabel()}\x1b[0m · profile=${PROFILE} · headless`)
}

// 组装 dsh 参数
const bootArgs = ['--profile', PROFILE]
if (patchFile) bootArgs.push('--patch', patchFile)

// 自动记忆（对标 cowork）：任务末尾强制评估并沉淀值得长期记住的信息。
// 任务内直接指令比 AGENTS.md 行为准则执行率高；--no-memory 可关闭。
// 启动器在任务前后快照 memories 目录，跑完打印真实落盘结果（不依赖模型声称）。
const memBefore = memorySnapshot()

if (!rest.includes('--no-memory')) {
  const taskIdx = rest.findIndex((a) => !a.startsWith('-'))
  if (taskIdx >= 0) {
    const task = rest[taskIdx]
    rest[taskIdx] =
      task +
      `\n\n[自动记忆] 完成任务后，评估本轮是否出现值得长期记住的信息（用户偏好/产品决策/架构约定/踩坑结论/新能力状态）；` +
      `如有，用 write 写入 ${memoryDir}\\<topic>.md（UPSERT，topic 用英文短词，路径必须是 ${memoryDir} 下的绝对路径）；` +
      `然后在回答末尾用一行说明：写了哪些记忆（写清文件名），没有则写：无新增记忆。`
  }
}

process.argv = [process.argv[0], process.argv[1], ...bootArgs, ...rest]

const beforeExit = async (code) => {
  try {
    const after = memorySnapshot()
    const added = after.filter((f) => !memBefore.includes(f))
    if (added.length > 0) {
      console.log(`\x1b[36m自动记忆落盘\x1b[0m · ${added.length} 个新文件：${added.join(', ')}`)
    } else {
      console.log('自动记忆：无新增记忆文件')
    }
  } catch {
    console.log('自动记忆：memories 目录不可读')
  }
  process.exit(code)
}
process.on('exit', (code) => beforeExit(code))

await runCli({}).catch((error) => {
  console.error(`\x1b[31mgodot-codely\x1b[0m: ${error.message}`)
  process.exitCode = 1
})
