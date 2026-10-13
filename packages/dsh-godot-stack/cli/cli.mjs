#!/usr/bin/env node
/**
 * Godot Codely CLI —— 与桌面端共享同一 DSH harness 的交互式终端 Agent。
 *
 * 形态：CLI 会话层复用 dsh-godot-stack/bridge（TypertClient + 鉴权），
 * 与 Godot 编辑器面板/桌面端共用 harness 内核（43129）与 godot-codely-lite 预设。
 *
 * 用法：
 *   node cli/cli.mjs                          # 连接本机运行的 Godot Codely 桌面端
 *   node cli/cli.mjs --dsh-port 43129         # 指定 harness 端口
 *   node cli/cli.mjs --cwd D:\my-godot-game   # 指定工作目录（默认当前目录）
 *   node cli/cli.mjs --preset godot-codely-lite
 *   node cli/cli.mjs --once "改一下 player.gd 的跳跃力度"   # 单次问答
 */
import { createInterface } from 'node:readline'
import { existsSync } from 'node:fs'
import { TypertClient } from '../bridge/bridge.mjs'
import { tokenCandidatePaths } from '../data-home.mjs'

const args = parseArgs(process.argv.slice(2))
const DSH_PORT = Number(args['dsh-port'] ?? process.env.DSH_HARNESS_PORT ?? 43129)
const BASE = `http://127.0.0.1:${DSH_PORT}`
const CWD = args.cwd ?? process.cwd()
const PRESET = args.preset ?? 'godot-codely-lite'

// 桌面端由插件写 token；CLI 独立运行时从常见位置读取
function discoverTokenFile() {
  return tokenCandidatePaths().find((candidate) => existsSync(candidate))
}

const client = new TypertClient(BASE)

async function authOrExit() {
  const ok = await client.auth()
  if (ok) return
  console.error('[godot-codely] 无法鉴权：未找到 launch-token（请先启动 Godot Codely 桌面端）')
  process.exit(1)
}

async function findOrCreateSession() {
  try {
    const list = await client.call('session/list', { _request: {} })
    const existing = (list.items ?? []).find((i) => i.cwd && i.cwd.replace(/\\/g, '/') === CWD.replace(/\\/g, '/'))
    if (existing) return existing.sessionId
  } catch {}
  try {
    const c = await client.call('session/create', { request: { cwd: CWD, agentPreset: PRESET } })
    return c.sessionId
  } catch (e) {
    // preset 冲突时复用同 cwd 已有会话
    const list = await client.call('session/list', { _request: {} })
    const existing = (list.items ?? []).find((i) => i.cwd && i.cwd.replace(/\\/g, '/') === CWD.replace(/\\/g, '/'))
    if (existing) return existing.sessionId
    throw new Error(`创建会话失败：${e.message}`)
  }
}

async function promptAndStream(sessionId, text) {
  await client.call('session/prompt', {
    request: {
      requestId: crypto.randomUUID(),
      sessionId,
      mode: 'queue',
      content: [{ type: 'text', text }],
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  })
  let since = 0
  for (let i = 0; i < 600; i++) {
    await sleep(1500)
    const list = await client.call('session/list', { _request: {} })
    const item = (list.items ?? []).find((x) => x.sessionId === sessionId)
    const through = item?.projections?.asOfSeq
    if (through === undefined || through <= since) continue
    const page = await client.call('session/page', {
      request: { address: { kind: 'session', sessionId }, throughSeq: through, beforeSeq: through + 1, maxMessages: 200 },
    })
    since = through
    for (const r of page.records ?? []) {
      if (r.type !== 'event' || !r.event) continue
      const ev = r.event
      if (ev.type === 'assistant/message') {
        const m = ev.data?.message ?? ev.data
        const c = m?.content
        let textOut = ''
        if (typeof c === 'string') textOut = c
        else if (Array.isArray(c)) textOut = c.map((x) => x.text ?? '').join('')
        if (textOut) process.stdout.write(textOut)
      } else if (ev.type === 'agent-state') {
        const s = ev.data?.state
        if (s && s !== 'idle') process.stdout.write(`\n\x1b[90m[${s}]\x1b[0m\n`)
      } else if (ev.type === 'tool/call' || ev.type === 'tool/result') {
        // 工具事件：保持静默，只推进光标
      }
    }
    if (evIsDone(page.records ?? [])) return
  }
  process.stdout.write('\n\x1b[90m[等待超时]\x1b[0m\n')
}

function evIsDone(records) {
  return records.some((r) => r.type === 'event' && (r.event?.type === 'agent-state' ? r.event.data?.state === 'idle' : false))
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2)
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
      out[k] = v
    }
  }
  return out
}

async function main() {
  await authOrExit()
  const sessionId = await findOrCreateSession()
  console.log(`\x1b[36mGodot Codely CLI\x1b[0m · preset=${PRESET} · cwd=${CWD}`)
  console.log(`\x1b[90m会话 ${sessionId.slice(0, 24)}… 输入 /quit 退出，/new 新建会话\x1b[0m\n`)

  if (args.once) {
    await promptAndStream(sessionId, args.once)
    return
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  rl.setPrompt('\x1b[32mgc>\x1b[0m ')
  rl.prompt()
  rl.on('line', async (line) => {
    const t = line.trim()
    if (!t) { rl.prompt(); return }
    if (t === '/quit') { rl.close(); return }
    if (t === '/new') {
      const s = await findOrCreateSession()
      console.log(`\x1b[90m新会话 ${s.slice(0, 24)}…\x1b[0m`)
      rl.prompt(); return
    }
    process.stdout.write('\n')
    await promptAndStream(sessionId, t)
    process.stdout.write('\n')
    rl.prompt()
  })
}

main().catch((e) => { console.error('[godot-codely]', e.message); process.exit(1) })
