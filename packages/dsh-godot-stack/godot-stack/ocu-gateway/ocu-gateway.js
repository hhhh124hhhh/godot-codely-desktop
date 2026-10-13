#!/usr/bin/env node
// stdio MCP proxy: read tools pass through; writes retain the Godot app allowlist.
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { resolveOcuCommand } from './ocu-runtime.mjs'

const gateLevel = process.env.OCU_GATE_LEVEL || 'write-approve'
const allowedApps = (process.env.OCU_ALLOWED_APPS || 'Godot*,godot*,Godot_*')
  .split(',').map(value => value.trim()).filter(Boolean)
const readTools = new Set(['list_apps', 'get_app_state'])
const writeTools = new Set(['click', 'drag', 'perform_secondary_action', 'press_key', 'scroll', 'set_value', 'type_text'])
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

function gateTool(tool, params) {
  if (readTools.has(tool)) return null
  if (!writeTools.has(tool)) return `未分类工具 "${tool}" 默认拒绝（fail-closed）`
  if (gateLevel === 'read-only') return `当前档位 read-only：写类工具 "${tool}" 被拒绝`
  const app = isObject(params) ? params.app : undefined
  if (typeof app !== 'string' || !app.trim()) return `写类工具 "${tool}" 缺少目标 app，操作被拒绝`
  const allowed = allowedApps.some(pattern => {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    return new RegExp(`^${escaped}$`, 'i').test(app)
  })
  return allowed ? null : `目标窗口 "${app}" 不在白名单（${allowedApps.join(', ')}），写操作被拒绝`
}

async function main() {
  if (!['read-only', 'write-approve'].includes(gateLevel)) throw new Error(`invalid OCU_GATE_LEVEL: ${gateLevel}`)
  let launch
  try {
    launch = await resolveOcuCommand(process.argv.slice(2))
  } catch (error) {
    throw new Error(`resolve: ${error.message}; install the managed runtime with cli/setup-ocu.mjs`, { cause: error })
  }
  // No shell: Node and launcher paths (including spaces) remain distinct arguments on Windows.
  const child = spawn(launch.command, launch.args, { stdio: ['pipe', 'pipe', 'inherit'], shell: false, windowsHide: true })
  const requests = createInterface({ input: process.stdin })
  const responses = createInterface({ input: child.stdout })
  const pending = new Map()
  let failed = false

  function send(message) {
    if (!process.stdout.destroyed) process.stdout.write(`${JSON.stringify(message)}\n`)
  }

  function fail(stage, error) {
    if (failed) return
    failed = true
    const detail = `[ocu-gateway] ${stage}: ${error.message}`
    console.error(detail)
    for (const { id } of pending.values()) {
      send({ jsonrpc: '2.0', id, error: { code: -32000, message: detail } })
    }
    pending.clear()
    requests.close()
    process.stdin.destroy()
    child.stdin.destroy()
    child.kill()
    process.exitCode = 1
  }

  requests.on('line', line => {
    if (failed || !line.trim()) return
    let message
    try { message = JSON.parse(line) } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } })
      return
    }
    if (!isObject(message) || message.jsonrpc !== '2.0') {
      send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid JSON-RPC request' } })
      return
    }
    const hasId = typeof message.id === 'string' || typeof message.id === 'number'
    const tool = message.method === 'tools/call' && isObject(message.params) ? message.params.name : undefined
    if (message.method === 'tools/call') {
      const blocked = gateTool(tool, message.params?.arguments)
      if (blocked) {
        if (hasId) send({ jsonrpc: '2.0', id: message.id, result: {
          content: [{ type: 'text', text: `[ocu-gateway] ${blocked}` }], isError: true,
        } })
        return
      }
    }
    if (hasId) pending.set(message.id, { id: message.id, tool })
    if (!child.stdin.write(`${line}\n`)) requests.pause()
  })
  child.stdin.on('drain', () => requests.resume())
  requests.on('close', () => { if (!child.stdin.destroyed) child.stdin.end() })
  process.stdin.on('error', error => fail('client stdin', error))
  process.stdout.on('error', error => fail('client stdout', error))
  child.on('error', error => fail('spawn', error))
  child.stdin.on('error', error => fail('upstream stdin', error))
  child.stdout.on('error', error => fail('upstream stdout', error))

  responses.on('line', line => {
    if (!line.trim() || failed) return
    let message
    try { message = JSON.parse(line) } catch {
      fail('upstream protocol', new Error('non-JSON output on MCP stdout'))
      return
    }
    if (!isObject(message) || message.jsonrpc !== '2.0') {
      fail('upstream protocol', new Error('invalid JSON-RPC response'))
      return
    }
    const request = pending.get(message.id)
    pending.delete(message.id)
    if (request && writeTools.has(request.tool) && isObject(message.result) &&
      !message.result.isError && Array.isArray(message.result.content)) {
      message.result.content.push({ type: 'text', text: `[ocu-gateway] 写操作 ${request.tool} 已执行（白名单内）` })
    }
    send(message)
  })
  // close (rather than exit) drains final stdout responses before ending the proxy.
  child.on('close', (code, signal) => {
    if (!failed && (code !== 0 || signal || pending.size)) {
      fail('upstream exit', new Error(`code=${code} signal=${signal || 'none'} pending=${pending.size}`))
    }
    requests.close()
    process.stdin.destroy()
    process.exitCode = failed ? 1 : 0
  })
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
}

main().catch(error => {
  console.error(`[ocu-gateway] ${error.message}`)
  process.exitCode = 1
})
