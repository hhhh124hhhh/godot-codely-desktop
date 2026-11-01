import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { formatReportLines, parseEntryLine, readNewEntries } from '../scripts/progress.mjs'

const scriptPath = join(process.cwd(), 'scripts', 'progress.mjs')
const notifyPath = join(process.cwd(), 'scripts', 'feishu-notify.mjs')

describe('progress.mjs parsing and formatting', () => {
  it('parses valid entry lines and rejects malformed ones', () => {
    expect(
      parseEntryLine(JSON.stringify({ ts: '2026-10-18T08:00:00.000Z', task: '#46', status: 'in_progress', message: '开始' }))
    ).toEqual({ ts: '2026-10-18T08:00:00.000Z', task: '#46', status: 'in_progress', message: '开始' })
    expect(parseEntryLine('not json')).toBeNull()
    expect(parseEntryLine(JSON.stringify({ ts: 'x', message: 1 }))).toBeNull()
    expect(parseEntryLine(JSON.stringify({ message: '缺 ts' }))).toBeNull()
  })

  it('reads only entries after the cursor offset', () => {
    const a = JSON.stringify({ ts: '2026-10-18T08:00:00.000Z', message: 'a' })
    const b = JSON.stringify({ ts: '2026-10-18T08:05:00.000Z', message: 'b' })
    const c = JSON.stringify({ ts: '2026-10-18T08:10:00.000Z', message: 'c' })
    const content = `${a}\n${b}\n${c}\n`
    const offB = a.length + 1
    expect(readNewEntries(content, 0)).toHaveLength(3)
    expect(readNewEntries(content, offB).map((e) => e.message)).toEqual(['b', 'c'])
    expect(readNewEntries(content, content.length)).toHaveLength(0)
  })

  it('formats lines with time, task, status and truncates long reports', () => {
    const entries = Array.from({ length: 15 }, (_, i) => ({
      ts: '2026-10-18T08:00:00.000Z',
      task: '#45',
      status: 'done',
      message: `step ${i + 1}`
    }))
    const lines = formatReportLines(entries)
    expect(lines[0]).toContain('另有 5 条')
    expect(lines).toHaveLength(11)
    expect(lines[1]).toContain('#45 · done')
    expect(lines[1]).toContain('step 6')
    expect(lines[10]).toContain('step 15')
  })
})

describe('progress.mjs log + report flow', () => {
  const servers: Array<{ close: () => Promise<void> }> = []
  const dirs: string[] = []

  afterEach(async () => {
    for (const server of servers.splice(0)) await server.close()
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  function runNode(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolvePromise) => {
      execFile(process.execPath, args, { cwd, env: process.env }, (err, stdout, stderr) => {
        resolvePromise({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout, stderr })
      })
    })
  }

  async function startStub() {
    const requests: Array<{ payload: unknown }> = []
    const server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => {
        requests.push({ payload: JSON.parse(Buffer.concat(chunks).toString('utf8')) })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ code: 0 }))
      })
    })
    await new Promise<void>((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise))
    servers.push({ close: () => new Promise((resolvePromise) => server.close(() => resolvePromise())) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('stub did not bind a port')
    return { url: `http://127.0.0.1:${address.port}/hook`, requests }
  }

  /** A throwaway repo-shaped dir so the script resolves logs/ and scripts/feishu-notify.mjs locally. */
  function buildFixture(): string {
    const home = mkdtempSync(join(tmpdir(), 'progress-repo-'))
    dirs.push(home)
    mkdirSync(join(home, 'scripts'), { recursive: true })
    mkdirSync(join(home, 'logs'), { recursive: true })
    cpSync(scriptPath, join(home, 'scripts', 'progress.mjs'))
    cpSync(notifyPath, join(home, 'scripts', 'feishu-notify.mjs'))
    return home
  }

  it('aggregates new entries into one card and advances the cursor only on success', async () => {
    const stub = await startStub()
    const home = buildFixture()
    const progress = join(home, 'scripts', 'progress.mjs')

    const log1 = await runNode([progress, 'log', '--task', '#46', '--status', 'in_progress', '--message', '验证开始'], home)
    expect(log1.code).toBe(0)
    await runNode([progress, 'log', '--message', '无任务纯消息'], home)

    const report1 = await runNode([progress, 'report', '--webhook', stub.url], home)
    expect(report1.code).toBe(0)
    expect(stub.requests).toHaveLength(1)
    const payload = stub.requests[0]?.payload as { card: { header: { title: { content: string } }; elements: Array<{ text: { content: string } }> } }
    expect(payload.card.header.title.content).toContain('Codely 进展汇总')
    const body = payload.card.elements[0]?.text.content ?? ''
    expect(body).toContain('#46 · in_progress')
    expect(body).toContain('验证开始')
    expect(body).toContain('无任务纯消息')

    // No new entries -> second report sends nothing.
    const report2 = await runNode([progress, 'report', '--webhook', stub.url], home)
    expect(report2.code).toBe(0)
    expect(stub.requests).toHaveLength(1)

    // New entry -> only the new entry is reported.
    await runNode([progress, 'log', '--message', '第二轮进展'], home)
    const report3 = await runNode([progress, 'report', '--webhook', stub.url], home)
    expect(report3.code).toBe(0)
    expect(stub.requests).toHaveLength(2)
    const body3 = (stub.requests[1]?.payload as typeof payload).card.elements[0]?.text.content ?? ''
    expect(body3).toContain('第二轮进展')
    expect(body3).not.toContain('验证开始')

    // Cursor file reflects the consumed offset.
    const cursor = parseInt(readFileSync(join(home, 'logs', 'progress.cursor'), 'utf8'), 10)
    expect(cursor).toBeGreaterThan(0)
  })

  it('keeps the cursor when the webhook rejects the report', async () => {
    const rejectRequests: unknown[] = []
    const server = createServer((req, res) => {
      req.on('data', () => {})
      req.on('end', () => {
        rejectRequests.push({})
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ code: 19021 }))
      })
    })
    await new Promise<void>((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise))
    servers.push({ close: () => new Promise((resolvePromise) => server.close(() => resolvePromise())) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('stub did not bind a port')

    const home = buildFixture()
    const progress = join(home, 'scripts', 'progress.mjs')
    await runNode([progress, 'log', '--message', '会失败的进展'], home)

    const report = await runNode([progress, 'report', '--webhook', `http://127.0.0.1:${address.port}/bad`], home)
    expect(report.code).toBe(1)
    expect(() => readFileSync(join(home, 'logs', 'progress.cursor'), 'utf8')).toThrow()

    // Retry against a healthy webhook: the failed entry is still delivered.
    const stub = await startStub()
    const retry = await runNode([progress, 'report', '--webhook', stub.url], home)
    expect(retry.code).toBe(0)
    expect(stub.requests).toHaveLength(1)
    const body = (stub.requests[0]?.payload as { card: { elements: Array<{ text: { content: string } }> } }).card.elements[0]?.text.content ?? ''
    expect(body).toContain('会失败的进展')
  })

  it('exits 2 with usage guidance on malformed log arguments', async () => {
    const home = buildFixture()
    const result = await runNode([join(home, 'scripts', 'progress.mjs'), 'log', '--task', '#46'], home)
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('--message')
  })
})
