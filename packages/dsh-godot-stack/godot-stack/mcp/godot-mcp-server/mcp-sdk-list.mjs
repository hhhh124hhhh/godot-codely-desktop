// 官方 MCP SDK 客户端验证工具列表（在 MCP server 目录运行）
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { writeFileSync } from 'node:fs'

const SERVER = './build/index.js'
const out = []

try {
  const transport = new StdioClientTransport({ command: 'node', args: [SERVER] })
  const client = new Client({ name: 'verify', version: '1' })
  await client.connect(transport)
  const res = await client.listTools()
  const tools = res.tools
  out.push(`工具总数: ${tools.length}`)
  for (const t of tools) out.push(`- ${t.name}`)
  const names = tools.map((t) => t.name)
  out.push('--- 抽查 ---')
  for (const key of ['memory_remember', 'memory_recall', 'memory_list', 'lsp_diagnostics', 'generate_image', 'text_to_speech', 'project', 'scene_design']) {
    out.push(`${key}: ${names.includes(key) ? 'OK' : 'NO'}`)
  }
  await client.close()
} catch (e) {
  out.push('错误: ' + e.stack || e.message)
}
writeFileSync('D:\\tools\\mcp-sdk-list.txt', out.join('\n'), 'utf8')
console.log('done')
process.exit(0)
