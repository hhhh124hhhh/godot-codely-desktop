#!/usr/bin/env node
// Send a progress notification through a Feishu custom-robot webhook.
//
// Webhook resolution order:
//   1. --webhook <url>
//   2. FEISHU_RELEASE_WEBHOOK environment variable
//   3. .secrets/feishu-webhook (first non-empty line, repo-local, gitignored)
//
// Usage:
//   node scripts/feishu-notify.mjs --message "Codely 发布构建完成"
//   node scripts/feishu-notify.mjs --title "Codely #45 安装见证" \
//     --level success --message "安装: PASS" --message "升级: FAIL"
//   echo "多行内容" | node scripts/feishu-notify.mjs
//
// Exit codes: 0 sent; 1 webhook rejected / transport error; 2 no webhook configured.

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const webhookFile = join(repoRoot, '.secrets', 'feishu-webhook')

const LEVEL_TEMPLATES = {
  info: 'blue',
  success: 'green',
  warning: 'orange',
  error: 'red'
}

function parseArgs(argv) {
  const options = {
    title: '',
    level: 'info',
    messages: [],
    webhook: '',
    keyword: process.env.FEISHU_NOTIFY_KEYWORD || ''
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      i += 1
      if (i >= argv.length) usageError(`missing value for ${arg}`)
      return argv[i]
    }
    if (arg === '--message' || arg === '-m') options.messages.push(next())
    else if (arg === '--title') options.title = next()
    else if (arg === '--level') options.level = next()
    else if (arg === '--webhook') options.webhook = next()
    else if (arg === '--keyword') options.keyword = next()
    else if (arg === '--help') {
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 18).join('\n'))
      process.exit(0)
    } else usageError(`unknown argument: ${arg}`)
  }
  if (!Object.hasOwn(LEVEL_TEMPLATES, options.level)) {
    usageError(`--level must be one of: ${Object.keys(LEVEL_TEMPLATES).join(', ')}`)
  }
  return options
}

function usageError(message) {
  console.error(`feishu-notify: ${message}`)
  console.error('usage: node scripts/feishu-notify.mjs [--title T] [--level info|success|warning|error] [--webhook URL] [--keyword KW] --message MSG ...')
  process.exit(2)
}

function resolveWebhook(cliWebhook) {
  if (cliWebhook) return cliWebhook
  if (process.env.FEISHU_RELEASE_WEBHOOK) return process.env.FEISHU_RELEASE_WEBHOOK
  try {
    const line = readFileSync(webhookFile, 'utf8').split('\n').map((l) => l.trim()).find(Boolean)
    if (line) return line
  } catch {
    // fall through to the unified error below
  }
  console.error(
    'feishu-notify: no webhook configured.\n' +
      '  pass --webhook <url>, set FEISHU_RELEASE_WEBHOOK, or write the URL to .secrets/feishu-webhook'
  )
  process.exit(2)
}

function buildPayload({ title, level, messages, keyword }) {
  const text = messages.join('\n')
  const content = keyword && !text.includes(keyword) ? `${keyword} ${text}` : text
  if (!title) {
    return { msg_type: 'text', content: { text: content } }
  }
  const titleText = keyword && !title.includes(keyword) ? `${keyword} ${title}` : title
  return {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: LEVEL_TEMPLATES[level],
        title: { tag: 'plain_text', content: titleText }
      },
      elements: [{ tag: 'div', text: { tag: 'lark_md', content } }]
    }
  }
}

export { buildPayload, resolveWebhook }

const isMain =
  process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])
if (isMain) {
  const options = parseArgs(process.argv.slice(2))
  if (options.messages.length === 0 && !process.stdin.isTTY) {
    const stdin = readFileSync(0, 'utf8').trim()
    if (stdin) options.messages.push(stdin)
  }
  if (options.messages.length === 0) usageError('provide at least one --message or pipe content on stdin')

  const webhook = resolveWebhook(options.webhook)
  const payload = buildPayload(options)

  let resp
  try {
    resp = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload)
    })
  } catch (err) {
    console.error(`feishu-notify: request failed: ${err.message}`)
    process.exit(1)
  }
  let body = null
  try {
    body = await resp.json()
  } catch {
    // non-JSON body; judged by HTTP status below
  }
  const code = body && typeof body === 'object' ? body.code ?? body.StatusCode : null
  if (!resp.ok || (code !== null && code !== 0)) {
    console.error(`feishu-notify: webhook rejected the message (HTTP ${resp.status}): ${JSON.stringify(body)}`)
    process.exit(1)
  }
  console.log('feishu-notify: sent')
}
