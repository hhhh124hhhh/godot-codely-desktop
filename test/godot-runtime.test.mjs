import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, readFile, writeFile, rm, cp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, afterEach, describe, it, expect } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { provisionMcpRuntime } from '../packages/dsh-godot-stack/mcp-runtime.mjs'

const generated = resolve('.build/godot-runtime/packages/dsh-godot-stack/godot-stack/mcp/godot-mcp-server/runtime')
const roots = []
beforeAll(() => execFileSync(process.execPath, ['scripts/build-godot-runtime.mjs', '--no-project'], { windowsHide: true, stdio: 'pipe' }), 60000)
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 5 })))
})
async function fixture() {
  const home = await mkdtemp(join(tmpdir(), 'godot fresh home '))
  roots.push(home)
  return { home, target: join(home, '.godot/mcp-server') }
}

describe('shipped Godot MCP dependency closure', () => {
  it('starts in an empty home outside repository resolution and executes an actual tool', async () => {
    const { home, target } = await fixture()
    expect(await provisionMcpRuntime(generated, home, target)).toEqual({ status: 'configured' })
    const settings = JSON.parse(await readFile(join(home, 'settings.json'), 'utf8'))
    expect(settings.mcpServers.godot.command).toBe(process.execPath)
    expect(settings.mcpServers.godot.env.DSH_HOME).toBe(home)
    const transport = new StdioClientTransport({
      command: process.execPath, args: [join(target, 'build/index.js')], cwd: home,
      env: { PATH: process.env.PATH ?? '', DSH_HOME: home, GODOT_CODELY_MEMORY_DIR: join(home, 'memories') },
      stderr: 'pipe',
    })
    const client = new Client({ name: 'fresh-install-test', version: '1' })
    try {
      await client.connect(transport)
      const { tools } = await client.listTools()
      expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['scenes', 'nodes', 'memory_remember', 'memory_recall']))
      const saved = await client.callTool({ name: 'memory_remember', arguments: { topic: 'test', content: 'fresh runtime works' } })
      expect(saved.isError).not.toBe(true)
      const recalled = await client.callTool({ name: 'memory_recall', arguments: { topic: 'test' } })
      expect(JSON.stringify(recalled)).toContain('fresh runtime works')
      expect(await readFile(join(target, 'src/godot-scripts/godot_operations.gd'), 'utf8')).toContain('extends')
    } finally {
      await client.close()
    }
  }, 30000)

  it('rejects path traversal in recall and backs up overwritten memory', async () => {
    const { home, target } = await fixture()
    expect(await provisionMcpRuntime(generated, home, target)).toEqual({ status: 'configured' })
    const memoryDir = join(home, 'memories')
    await mkdir(memoryDir, { recursive: true })
    // 在记忆根外的父目录放标记文件（对应检查报告探针 B 场景）
    await writeFile(join(home, 'outside.md'), 'SECRET-OUTSIDE', 'utf8')
    const transport = new StdioClientTransport({
      command: process.execPath, args: [join(target, 'build/index.js')], cwd: home,
      env: { PATH: process.env.PATH ?? '', DSH_HOME: home, GODOT_CODELY_MEMORY_DIR: memoryDir },
      stderr: 'pipe',
    })
    const client = new Client({ name: 'memory-boundary-test', version: '1' })
    try {
      await client.connect(transport)
      // 1) recall 路径穿越必须被拒，且不泄露根外内容
      const traversal = await client.callTool({ name: 'memory_recall', arguments: { topic: '../outside' } })
      expect(traversal.isError).toBe(true)
      expect(JSON.stringify(traversal)).not.toContain('SECRET-OUTSIDE')
      // 2) 覆盖自动备份：first → second，.bak 保留 first
      await client.callTool({ name: 'memory_remember', arguments: { topic: 'topic_a', content: 'first' } })
      await client.callTool({ name: 'memory_remember', arguments: { topic: 'topic_a', content: 'second' } })
      expect(await readFile(join(memoryDir, 'topic_a.md.bak'), 'utf8')).toBe('first')
      expect(await readFile(join(memoryDir, 'topic_a.md'), 'utf8')).toBe('second')
    } finally {
      await client.close()
    }
  }, 30000)

  it('provisions the Godot skill bundle into the user skill root', async () => {
    const { home, target } = await fixture()
    expect(await provisionMcpRuntime(generated, home, target)).toEqual({ status: 'configured' })
    const skillsRoot = join(home, 'skills')
    const expected = ['scene-tree', 'gdscript', 'physics-movement', 'ui-ux', 'shader-worldgen', 'quality-gates', 'project-workflow', 'media-generation', 'godot-web-access', 'godot-memory']
    for (const name of expected) {
      expect(await readFile(join(skillsRoot, name, 'SKILL.md'), 'utf8'), name).toContain('name:')
    }
    // 二次 provisioning 幂等：已存在技能不覆盖、不报错
    expect(await provisionMcpRuntime(generated, home, target)).toEqual({ status: 'configured' })
    expect(await readFile(join(skillsRoot, 'scene-tree', 'SKILL.md'), 'utf8')).toContain('name:')
  }, 30000)

  it('serves the panel JSON transport from the packaged executable', async () => {
    const { home, target } = await fixture()
    await provisionMcpRuntime(generated, home, target)
    const listener = createServer()
    await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
    const port = listener.address().port
    await new Promise(resolve => listener.close(resolve))
    await writeFile(join(target, 'godot-mcp-server.config.json'), JSON.stringify({ port }))
    const child = spawn(process.execPath, [join(target, 'build/index.js')], {
      cwd: home, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
      env: { PATH: process.env.PATH ?? '', DSH_HOME: home, MCP_TRANSPORT: 'http' },
    })
    const client = new Client({ name: 'panel-json-test', version: '1' })
    try {
      await new Promise((resolve, reject) => {
        let stderr = ''
        const timer = setTimeout(() => reject(Error(`HTTP startup timed out: ${stderr}`)), 15000)
        child.once('error', error => { clearTimeout(timer); reject(error) })
        child.once('exit', code => { clearTimeout(timer); reject(Error(`HTTP exited ${code}: ${stderr}`)) })
        child.stderr.on('data', chunk => {
          stderr += chunk
          if (stderr.includes('HTTP 端点已起')) { clearTimeout(timer); resolve() }
        })
      })
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/api`)))
      expect((await client.listTools()).tools.map(tool => tool.name)).toContain('memory_list')
      expect((await client.callTool({ name: 'memory_list', arguments: {} })).isError).not.toBe(true)
    } finally {
      await client.close()
      if (child.exitCode === null) {
        const closed = new Promise(resolve => child.once('close', resolve))
        child.kill()
        await closed
      }
    }
  }, 30000)

  it('does not register a missing or corrupt artifact', async () => {
    const { home, target } = await fixture()
    await expect(provisionMcpRuntime(join(home, 'missing'), home, target)).rejects.toThrow()
    const source = join(home, 'source')
    await cp(generated, source, { recursive: true })
    await writeFile(join(source, 'build/index.js'), 'broken')
    await expect(provisionMcpRuntime(source, home, target)).rejects.toThrow('integrity')
    await expect(readFile(join(home, 'settings.json'))).rejects.toThrow()
  })

  it('repairs managed code while retaining user settings and configuration', async () => {
    const { home, target } = await fixture()
    const settings = { mcpServers: { godot: { command: 'custom', args: ['user-owned'] } }, theme: 'dark' }
    await writeFile(join(home, 'settings.json'), JSON.stringify(settings))
    await provisionMcpRuntime(generated, home, target)
    await writeFile(join(target, 'build/index.js'), 'damaged')
    await writeFile(join(target, 'godot-mcp-server.config.json'), '{"host":"user-host"}')
    await mkdir(join(target, 'node_modules/user-package'), { recursive: true })
    await writeFile(join(target, 'node_modules/user-package/keep'), 'user-owned')
    await provisionMcpRuntime(generated, home, target)
    expect(await readFile(join(home, 'settings.json'), 'utf8')).toBe(JSON.stringify(settings))
    expect(await readFile(join(target, 'godot-mcp-server.config.json'), 'utf8')).toContain('user-host')
    expect(await readFile(join(target, 'node_modules/user-package/keep'), 'utf8')).toBe('user-owned')
    expect(await readFile(join(target, 'build/index.js'), 'utf8')).not.toBe('damaged')
  })

  it('preserves invalid settings rather than replacing them with apparent success', async () => {
    const { home, target } = await fixture()
    await writeFile(join(home, 'settings.json'), '{ invalid user settings')
    await expect(provisionMcpRuntime(generated, home, target)).rejects.toThrow()
    expect(await readFile(join(home, 'settings.json'), 'utf8')).toBe('{ invalid user settings')
  })
})
