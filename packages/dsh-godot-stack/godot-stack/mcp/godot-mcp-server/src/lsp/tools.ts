// [sovereign] Godot Codely LSP 工具 —— 让 agent 拿到 GDScript 的精确语义诊断（对标 cowork 的 LSP/代码智能）。
//
// lsp_diagnostics(path, project_path?)：
//  - 通过 Godot 原生 Language Server（TCP）打开文件，收集 publishDiagnostics + 工作区加载错误
//  - 返回结构化诊断（severity/line/column/message），agent 据此自审代码，无需人工跑编辑器
//
// 能力进度：#18 LSP 通道（2026-10-12 真机打通：Godot 4.7 mono --editor --lsp-port --headless）

import { existsSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { McpTextResult } from '../memory/memory.js'
import { detectGodot, findProjectDir, getLspClient, type LspFileResult } from './lsp-client.js'

function textResult(text: string, isError = false): McpTextResult {
  return { content: [{ type: 'text', text }], isError }
}

export const LSP_TOOLS = [
  {
    name: 'lsp_diagnostics',
    description: [
      'Get exact GDScript semantic diagnostics (errors/warnings) for a script file via the Godot Language Server.',
      'Use it to self-review a .gd file before/after edits: catches undefined functions, type errors, unused params,',
      'and other GDScript compile-time issues that plain text review would miss.',
      'Returns structured diagnostics with severity, line, column, and message (1-based line/column).',
      'Example: lsp_diagnostics(path="scripts/player.gd") — resolves the project dir automatically.',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the .gd file (absolute, or relative to the Godot project dir)' },
        project_path: { type: 'string', description: 'Godot project directory (optional; auto-detected by walking up from path)' },
      },
      required: ['path'],
    },
  },
]

function formatResult(r: LspFileResult): string {
  const lines: string[] = []
  lines.push(`【LSP】${r.file}`)
  lines.push(`服务器: ${r.server ?? '未知'}`)
  if (r.diagnostics.length === 0) {
    lines.push('诊断：无错误/警告 ✅')
  } else {
    lines.push(`诊断 ${r.diagnostics.length} 条：`)
    for (const d of r.diagnostics) {
      lines.push(`- [${d.severity}] ${d.line}:${d.column} ${d.message}`)
    }
  }
  if (r.workspaceErrors.length > 0) {
    lines.push(`工作区加载错误 ${r.workspaceErrors.length} 条：`)
    for (const e of r.workspaceErrors) lines.push(`- ${e}`)
  }
  return lines.join('\n')
}

export async function dispatchLsp(name: string, args: Record<string, unknown>): Promise<McpTextResult> {
  switch (name) {
    case 'lsp_diagnostics': {
      const godot = detectGodot()
      if (!godot) {
        return textResult(
          '未找到 Godot 二进制（设置 GODOT_PATH 或安装到常见位置）。LSP 需要 Godot 编辑器版（--editor --lsp-port）。',
          true,
        )
      }
      let rawPath = String(args.path ?? '').trim()
      if (!rawPath) return textResult('path 不能为空', true)
      const projectPath = String(args.project_path ?? '').trim() || undefined

      // 解析文件绝对路径
      let filePath: string
      if (isAbsolute(rawPath)) {
        filePath = rawPath
      } else if (projectPath) {
        filePath = join(projectPath, rawPath)
      } else {
        return textResult('相对 path 需要 project_path（或传绝对路径）', true)
      }
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        return textResult(`文件不存在: ${filePath}`, true)
      }

      // 定位项目目录
      const proj = projectPath ?? findProjectDir(filePath)
      if (!proj) {
        return textResult(`无法定位项目目录（未找到 project.godot）：${filePath}`, true)
      }

      try {
        const client = getLspClient(proj, godot)
        const result = await client.diagnosticsFor(filePath)
        return textResult(formatResult(result))
      } catch (e) {
        return textResult(`LSP 调用失败: ${(e as Error).message}`, true)
      }
    }

    default:
      return textResult(`Unknown LSP tool: ${name}`, true)
  }
}
