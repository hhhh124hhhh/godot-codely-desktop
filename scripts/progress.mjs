#!/usr/bin/env node
// Unified progress log + aggregated Feishu push for multi-window Codely work.
//
//   node scripts/progress.mjs log --task "#46 产品验证" --status in_progress --message "验证开始"
//   node scripts/progress.mjs report
//
// `log` appends one JSON line to logs/progress.jsonl; any Kimi Code window,
// agent, or script in this repo can record progress this way.
// `report` reads entries written after the last reported offset (tracked in
// logs/progress.cursor), sends ONE aggregated card through
// scripts/feishu-notify.mjs, and only advances the cursor after the send
// succeeds, so nothing is lost on transient failures. With no new entries it
// exits silently (code 0, no message sent).
//
// Webhook resolution is identical to feishu-notify.mjs:
//   --webhook > FEISHU_RELEASE_WEBHOOK > .secrets/feishu-webhook

import { appendFileSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const logPath = join(repoRoot, 'logs', 'progress.jsonl')
const cursorPath = join(repoRoot, 'logs', 'progress.cursor')
const notifyScript = join(repoRoot, 'scripts', 'feishu-notify.mjs')

export const MAX_REPORT_LINES = 10

export function parseEntryLine(line) {
  try {
    const entry = JSON.parse(line)
    if (typeof entry !== 'object' || entry === null) return null
    if (typeof entry.ts !== 'string' || typeof entry.message !== 'string') return null
    return {
      ts: entry.ts,
      task: typeof entry.task === 'string' ? entry.task : '',
      status: typeof entry.status === 'string' ? entry.status : '',
      message: entry.message
    }
  } catch {
    return null
  }
}

export function formatReportLines(entries, now = new Date()) {
  const stamp = (iso) => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '??:??'
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const shown = entries.slice(-MAX_REPORT_LINES)
  const lines = shown.map((e) => {
    const tags = [e.task, e.status].filter(Boolean).join(' · ')
    return tags ? `[${stamp(e.ts)}] ${tags} — ${e.message}` : `[${stamp(e.ts)}] ${e.message}`
  })
  if (entries.length > shown.length) {
    lines.unshift(`… 另有 ${entries.length - shown.length} 条进展，仅显示最近 ${MAX_REPORT_LINES} 条`)
  }
  return lines
}

export function readNewEntries(content, cursorOffset) {
  const start = Number.isInteger(cursorOffset) && cursorOffset >= 0 ? Math.min(cursorOffset, content.length) : 0
  return content
    .slice(start)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map(parseEntryLine)
    .filter((entry) => entry !== null)
}

function usageError(message) {
  console.error(`progress: ${message}`)
  console.error('usage: node scripts/progress.mjs log --task T --status S --message MSG [--detail D]')
  console.error('       node scripts/progress.mjs report [--webhook URL]')
  process.exit(2)
}

function cmdLog(argv) {
  const entry = { ts: new Date().toISOString(), pid: process.pid }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      i += 1
      if (i >= argv.length) usageError(`missing value for ${arg}`)
      return argv[i]
    }
    if (arg === '--task') entry.task = next()
    else if (arg === '--status') entry.status = next()
    else if (arg === '--message' || arg === '-m') entry.message = next()
    else if (arg === '--detail') entry.detail = next()
    else usageError(`unknown argument: ${arg}`)
  }
  if (!entry.message) usageError('--message is required')
  appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8')
  console.log('progress: logged')
}

function resolveWebhook(cliWebhook) {
  if (cliWebhook) return cliWebhook
  if (process.env.FEISHU_RELEASE_WEBHOOK) return process.env.FEISHU_RELEASE_WEBHOOK
  try {
    const line = readFileSync(join(repoRoot, '.secrets', 'feishu-webhook'), 'utf8')
      .split('\n').map((l) => l.trim()).find(Boolean)
    if (line) return line
  } catch {
    // fall through
  }
  console.error('progress: no webhook configured (see scripts/feishu-notify.mjs)')
  process.exit(2)
}

function cmdReport(argv) {
  let webhook = ''
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--webhook') {
      i += 1
      if (i >= argv.length) usageError('missing value for --webhook')
      webhook = argv[i]
    } else usageError(`unknown argument: ${argv[i]}`)
  }
  if (!existsSync(logPath)) process.exit(0)
  const content = readFileSync(logPath, 'utf8')
  let cursor = 0
  try {
    cursor = parseInt(readFileSync(cursorPath, 'utf8').trim(), 10)
  } catch {
    cursor = 0
  }
  const entries = readNewEntries(content, cursor)
  if (entries.length === 0) process.exit(0)

  const args = [
    notifyScript,
    '--title', 'Codely 进展汇总',
    '--level', 'info',
    ...(webhook ? ['--webhook', webhook] : []),
    ...formatReportLines(entries).flatMap((line) => ['--message', line])
  ]
  let output
  try {
    output = execFileSync(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (err) {
    console.error(`progress: report push failed, cursor kept for retry: ${(err.stderr || err.message).toString().trim()}`)
    process.exit(1)
  }
  // Advance the cursor only after a confirmed send.
  const tmpPath = cursorPath + '.tmp'
  writeFileSync(tmpPath, String(content.length), 'utf8')
  renameSync(tmpPath, cursorPath)
  console.log(output.trim())
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isMain) {
  const [command, ...rest] = process.argv.slice(2)
  if (command === 'log') cmdLog(rest)
  else if (command === 'report') cmdReport(rest)
  else usageError(`unknown command: ${command || '(none)'}`)
}
