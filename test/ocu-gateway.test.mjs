import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { provisionOcuGateway, OCU_VERSION } from '../packages/dsh-godot-stack/godot-stack/ocu-gateway/ocu-runtime.mjs'

const gateway = resolve('packages/dsh-godot-stack/godot-stack/ocu-gateway/ocu-gateway.js')
const setup = resolve('packages/dsh-godot-stack/cli/setup-ocu.mjs')
const roots = []
const children = []
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null) {
      child.kill()
      await new Promise(resolve => child.once('close', resolve))
    }
  }
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ocu path with spaces '))
  roots.push(root)
  const script = join(root, 'fake upstream.mjs')
  await writeFile(script, `
    import { createInterface } from 'node:readline'
    const rl = createInterface({ input: process.stdin })
    rl.on('line', line => {
      const message = JSON.parse(line)
      if (message.method === 'crash') process.exit(7)
      if (message.method === 'noise') { console.log('bad upstream output'); return }
      if (message.method === 'hold') return
      if (message.id === undefined) return
      console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {
        content: [{ type: 'text', text: JSON.stringify(message.params || {}) }],
        ...(message.params?.arguments?.fail ? { isError: true } : {}),
      } }))
    })
  `)
  return { root, script }
}

function start(args, env = {}, entry = gateway) {
  const child = spawn(process.execPath, [entry, ...args], {
    env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  })
  children.push(child)
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', data => { stdout += data })
  child.stderr.on('data', data => { stderr += data })
  const done = new Promise(resolve => child.once('close', code => resolve({ code, stdout, stderr })))
  return {
    child, done,
    async call(message) {
      const previous = stdout.split('\n').length
      child.stdin.write(`${JSON.stringify(message)}\n`)
      await expect.poll(() => stdout.split('\n').length, { timeout: 5000 }).toBeGreaterThan(previous)
      return JSON.parse(stdout.trim().split('\n').at(-1))
    },
  }
}

describe('OCU gateway real child process', () => {
  it('forwards paths with spaces without a shell and drains responses on client EOF', async () => {
    const { script } = await fixture()
    const proxy = start(['--', process.execPath, script])
    proxy.child.stdin.end(`${JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'ping' })}\n`)
    const result = await proxy.done
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout).id).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('enforces app and read-only gates while watermarking only successful writes including id zero', async () => {
    const { script } = await fixture()
    const proxy = start(['--', process.execPath, script])
    const call = (id, app, fail) => proxy.call({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'click', arguments: { app, fail } } })
    expect((await call(1, 'Chrome')).result.isError).toBe(true)
    expect((await call(2)).result.isError).toBe(true)
    expect((await call(0, 'Godot Engine')).result.content.at(-1).text).toContain('已执行')
    const failed = await call(3, 'Godot Engine', true)
    expect(failed.result.isError).toBe(true)
    expect(failed.result.content).toHaveLength(1)
    const readonly = start(['--', process.execPath, script], { OCU_GATE_LEVEL: 'read-only' })
    const denied = await readonly.call({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'type_text', arguments: { app: 'Godot' } } })
    expect(denied.result.isError).toBe(true)
    const allowed = await readonly.call({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_app_state', arguments: { app: 'Godot' } } })
    expect(allowed.result.isError).toBeUndefined()
  })

  it('reports spawn failure rather than hiding it as a successful exit', async () => {
    const { root } = await fixture()
    const result = await start(['--', join(root, 'missing.exe')]).done
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('spawn:')
    expect(result.stderr).not.toContain('Unhandled')
  })

  it.each(['crash', 'noise'])('fails pending requests with the upstream stage for %s', async method => {
    const { script } = await fixture()
    const proxy = start(['--', process.execPath, script])
    const message = await proxy.call({ jsonrpc: '2.0', id: 1, method })
    expect(message.error.message).toContain(method === 'crash' ? 'upstream exit' : 'upstream protocol')
    expect((await proxy.done).code).toBe(1)
  })

  it('resolves the provisioned managed runtime independent of cwd/PATH and diagnoses missing installs', async () => {
    const { root, script } = await fixture()
    const entry = await provisionOcuGateway(root)
    const missing = await start([], { DSH_HOME: root }, entry).done
    expect(missing.code).toBe(1)
    expect(missing.stderr).toContain('resolve:')
    const packageRoot = join(root, '.godot', 'ocu-runtime', 'node_modules', 'open-computer-use')
    await mkdir(join(packageRoot, 'bin'), { recursive: true })
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: 'open-computer-use', version: OCU_VERSION, type: 'module' }))
    await cp(script, join(packageRoot, 'bin', 'ocu'))
    const proxy = start([], { DSH_HOME: root, PATH: '' }, entry)
    expect((await proxy.call({ jsonrpc: '2.0', id: 1, method: 'ping' })).id).toBe(1)
  })

  it('reuses a pinned runtime and prints a portable MCP config; unavailable native runtime is retained', async () => {
    const { root } = await fixture()
    const packageRoot = join(root, '.godot', 'ocu-runtime', 'node_modules', 'open-computer-use')
    await mkdir(join(packageRoot, 'bin'), { recursive: true })
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: 'open-computer-use', version: OCU_VERSION }))
    const launcher = join(packageRoot, 'bin', 'ocu')
    await writeFile(launcher, 'console.log(JSON.stringify({capabilities:{nativeMcp:{available:true}}}))')
    const success = await start(['--home', root], {}, setup).done
    expect(success.code).toBe(0)
    const config = JSON.parse(success.stdout)
    expect(config.command).toBe(process.execPath)
    expect(config.env.DSH_HOME).toBe(root)
    expect(config.args).toEqual([join(root, '.godot', 'ocu-gateway', 'ocu-gateway.js')])
    await writeFile(launcher, 'console.log(JSON.stringify({capabilities:{nativeMcp:{available:false}}}))')
    const unavailable = await start(['--home', root], {}, setup).done
    expect(unavailable.code).toBe(1)
    expect(unavailable.stderr).toContain('unavailable on this platform')
    expect(await readFile(launcher, 'utf8')).toContain('available:false')
  })
})
