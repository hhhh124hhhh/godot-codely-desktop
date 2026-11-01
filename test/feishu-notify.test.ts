import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildPayload } from '../scripts/feishu-notify.mjs'

const scriptPath = join(process.cwd(), 'scripts', 'feishu-notify.mjs')

function runNotify(args: string[], env: NodeJS.ProcessEnv = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    execFile(
      process.execPath,
      [scriptPath, ...args],
      { env: { ...process.env, ...env } },
      (err, stdout, stderr) => {
        resolvePromise({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout, stderr })
      }
    )
  })
}

describe('feishu-notify payload contract', () => {
  it('builds a plain text payload without a title', () => {
    expect(buildPayload({ title: '', level: 'info', messages: ['Codely hello'], keyword: '' })).toEqual({
      msg_type: 'text',
      content: { text: 'Codely hello' }
    })
  })

  it('builds an interactive card and maps levels to header templates', () => {
    const payload = buildPayload({
      title: 'Codely 安装见证',
      level: 'error',
      messages: ['安装: FAIL', '原因: exit 1'],
      keyword: ''
    }) as { msg_type: string; card: { header: { template: string; title: { content: string } }; elements: Array<{ text: { content: string } }> } }
    expect(payload.msg_type).toBe('interactive')
    expect(payload.card.header.template).toBe('red')
    expect(payload.card.header.title.content).toBe('Codely 安装见证')
    expect(payload.card.elements[0]?.text.content).toBe('安装: FAIL\n原因: exit 1')
  })

  it('prepends the keyword when the robot enforces keyword verification', () => {
    const payload = buildPayload({ title: '进度', level: 'info', messages: ['构建完成'], keyword: 'Codely' })
    expect(JSON.stringify(payload)).toContain('Codely 构建完成')
    const already = buildPayload({ title: '进度', level: 'info', messages: ['Codely 构建完成'], keyword: 'Codely' })
    expect(JSON.stringify(already).match(/Codely 构建完成/g)).toHaveLength(1)
  })

  it('joins multiple --message values with newlines', () => {
    const payload = buildPayload({ title: '', level: 'info', messages: ['a', 'b'], keyword: '' })
    expect(payload).toEqual({ msg_type: 'text', content: { text: 'a\nb' } })
  })
})

describe('feishu-notify webhook delivery', () => {
  const servers: Array<{ close: () => Promise<void> }> = []
  const tempDirs: string[] = []

  afterEach(async () => {
    for (const server of servers.splice(0)) await server.close()
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  async function startStub(statusCode: number, body: object) {
    const requests: Array<{ url: string; payload: unknown }> = []
    const server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => {
        requests.push({ url: req.url ?? '', payload: JSON.parse(Buffer.concat(chunks).toString('utf8')) })
        res.writeHead(statusCode, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(body))
      })
    })
    await new Promise<void>((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise))
    servers.push({ close: () => new Promise((resolvePromise) => server.close(() => resolvePromise())) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('stub did not bind a port')
    return { url: `http://127.0.0.1:${address.port}/webhook`, requests }
  }

  it('posts the payload to --webhook and exits 0 on code 0', async () => {
    const stub = await startStub(200, { code: 0 })
    const result = await runNotify(['--webhook', stub.url, '--title', 'Codely t', '--message', 'done'])
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('sent')
    expect(stub.requests).toHaveLength(1)
  })

  it('exits 1 when the webhook rejects the message', async () => {
    const stub = await startStub(200, { code: 9499, msg: 'sign match fail' })
    const result = await runNotify(['--webhook', stub.url, '--message', 'x'])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('9499')
  })

  it('exits 2 with guidance when no webhook is configured', async () => {
    const { existsSync } = await import('node:fs')
    if (existsSync(join(process.cwd(), '.secrets', 'feishu-webhook'))) {
      // The script resolves the file relative to the repo, not the cwd, so a
      // locally configured webhook would mask this path.
      return
    }
    const result = await runNotify(['--message', 'x'], {
      FEISHU_RELEASE_WEBHOOK: '',
      FEISHU_NOTIFY_KEYWORD: ''
    })
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('.secrets/feishu-webhook')
  })

  it('sends stdin content when no --message is given', async () => {
    const stub = await startStub(200, { code: 0 })
    const result = await new Promise<{ code: number | null }>((resolvePromise) => {
      const child = execFile(
        process.execPath,
        [scriptPath, '--webhook', stub.url],
        { env: process.env },
        (err) => resolvePromise({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0 })
      )
      child.stdin?.end('stdin line 1\nstdin line 2')
    })
    expect(result.code).toBe(0)
    const payload = stub.requests[0]?.payload as { content: { text: string } }
    expect(payload.content.text).toBe('stdin line 1\nstdin line 2')
  })

  it('reads the webhook from .secrets/feishu-webhook when env and --webhook are absent', async () => {
    const stub = await startStub(200, { code: 0 })
    const home = mkdtempSync(join(tmpdir(), 'feishu-notify-repo-'))
    tempDirs.push(home)
    mkdirSync(join(home, '.secrets'), { recursive: true })
    writeFileSync(join(home, '.secrets', 'feishu-webhook'), `\n${stub.url}\n`)
    // The script resolves .secrets/ relative to the repo root (one level up
    // from scripts/), so mirror that layout in the temp repo.
    const { copyFileSync, mkdirSync: mkdir } = await import('node:fs')
    mkdir(join(home, 'scripts'), { recursive: true })
    copyFileSync(scriptPath, join(home, 'scripts', 'feishu-notify.mjs'))
    const result = await runNotifyInDir(home, ['--message', 'from file'])
    expect(result.code).toBe(0)
    expect(stub.requests).toHaveLength(1)
  })
})

function runNotifyInDir(dir: string, args: string[]): Promise<{ code: number | null }> {
  return new Promise((resolvePromise) => {
    execFile(process.execPath, [join(dir, 'scripts', 'feishu-notify.mjs'), ...args], { cwd: dir, env: process.env }, (err) =>
      resolvePromise({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0 })
    )
  })
}
