#!/usr/bin/env node
/**
 * Godot Codely CLI —— DSH headless profile 的品牌化启动器（B 方案）。
 *
 * 形态对标 Tuanjie Cowork 的 codely CLI：独立进程、headless 内核、
 * 单次任务（one-shot）或 REPL 交互，不依赖桌面端运行。
 *
 * 用法：
 *   godot-codely "把 player.gd 的跳跃力度改成 400"     # 单次任务，打印结果退出
 *   godot-codely --profile web ...                    # 透传 dsh 的 profile 参数
 *
 * 底层复用 @deepseek-ai/dsh 的 runCli：默认 boot 自定义 profile
 * `godot-codely`（由 headless 模板初始化），其余参数原样透传。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { runCli } from '@deepseek-ai/dsh/lib/bin.js'

const PROFILE = 'godot-codely'
const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profileDir = join(home, 'profiles', PROFILE)

// 品牌横幅（仅在直接运行本命令时输出，透传 dsh 参数时保持简洁）
const argv = process.argv.slice(2)
const first = argv[0]
if (first !== 'plugin' && !argv.includes('--profile')) {
  const needInit = !existsSync(join(profileDir, 'package.json'))
  if (needInit) {
    console.log(`\x1b[36mGodot Codely CLI\x1b[0m · 初始化 profile "${PROFILE}"（headless 模板）`)
    process.argv = [process.argv[0], process.argv[1], '--profile', PROFILE, '--from-default-profile', 'headless', ...argv]
  } else {
    console.log(`\x1b[36mGodot Codely CLI\x1b[0m · profile=${PROFILE} · headless`)
    process.argv = [process.argv[0], process.argv[1], '--profile', PROFILE, ...argv]
  }
}

await runCli({}).catch((error) => {
  console.error(`\x1b[31mgodot-codely\x1b[0m: ${error.message}`)
  process.exitCode = 1
})
