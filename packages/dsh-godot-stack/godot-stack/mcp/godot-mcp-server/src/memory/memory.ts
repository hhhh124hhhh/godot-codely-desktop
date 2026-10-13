// [sovereign] Godot Codely 独有记忆工具 —— 对标 cowork 的动态记忆（跨会话持久化）。
//
// 与 AGENTS.md 静态指令链互补：
//  - AGENTS.md 链：静态、由 dsh-agent-instructions 注入（全局/项目/目录）
//  - 本模块：动态、agent 主动读写 ~/.godot-codely/memories/<topic>.md。
//    桌面端 DSH_HOME 指向 <userData>/harness 时也不改这个目录，避免和 CLI 拆成两套。
//    若旧文件只在 DSH_HOME/memories，首次访问时复制到共享目录，不覆盖已有共享副本。
//
// 工具：
//  - memory_remember(topic, content)  UPSERT 一条长期记忆
//  - memory_recall(topic)             按主题检索记忆（精确 + 模糊）
//  - memory_list()                    列出全部记忆主题
//
// 安全：topic 白名单字符校验（防路径穿越）、单条大小上限、目录随 home 变化自动创建。

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'fs'
import { join, basename, sep } from 'path'
import { homedir } from 'os'

const MAX_MEMORY_BYTES = 200_000 // 单条记忆 200KB 上限
const MAX_TOPIC_LEN = 64

export interface McpTextResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function textResult(text: string, isError = false): McpTextResult {
  return { content: [{ type: 'text', text }], isError }
}

/** 记忆根目录：GODOT_CODELY_MEMORY_DIR 优先，否则 ~/.godot-codely/memories。不跟随 DSH_HOME，也不使用上游 ~/.dsh。 */
export function memoryRoot(): string {
  const override = process.env.GODOT_CODELY_MEMORY_DIR
  if (override) return override
  return join(homedir(), '.godot-codely', 'memories')
}

function legacyMemoryDir(): string {
  const dshHome = process.env.DSH_HOME
  if (!dshHome) return ''
  const legacy = join(dshHome, 'memories')
  if (legacy === memoryRoot()) return ''
  return legacy
}

/** topic 只允许字母数字中划线下划线点与中文（防路径穿越） */
function sanitizeTopic(topic: string): string | null {
  if (!topic || topic.length > MAX_TOPIC_LEN) return null
  if (!/^[\w\u4e00-\u9fa5\-._]+$/.test(topic)) return null
  if (topic.includes('..') || topic.includes('/') || topic.includes('\\') || topic.includes(sep)) return null
  return topic
}

/** recall 关键词查询：只挡路径穿越，允许部分词模糊检索（不要求完整 topic 合法性） */
function isSafeQuery(query: string): boolean {
  if (!query || query.length > MAX_TOPIC_LEN + 16) return false
  if (query.includes('..') || query.includes('/') || query.includes('\\') || query.includes(sep)) return false
  return true
}

function ensureDir(): string {
  const root = memoryRoot()
  mkdirSync(root, { recursive: true })
  const legacy = legacyMemoryDir()
  if (!legacy || !existsSync(legacy)) return root
  let names: string[] = []
  try {
    names = readdirSync(legacy)
  } catch {
    // The old directory can disappear between the exists check and the read.
    return root
  }
  for (const name of names) {
    if (!name.endsWith('.md') && !name.endsWith('.md.bak')) continue
    const dest = join(root, name)
    if (existsSync(dest)) continue
    try {
      writeFileSync(dest, readFileSync(join(legacy, name)))
    } catch {
      // One unreadable legacy file must not block new writes.
    }
  }
  return root
}

export const MEMORY_TOOLS = [
  {
    name: 'memory_remember',
    description: [
      'Store a long-term memory under a topic (persists across sessions, shared by CLI & desktop).',
      'Use it to remember user preferences, project facts, decisions, or recurring conventions.',
      'Overwrites the previous content of the same topic (UPSERT).',
      'Example: memory_remember(topic="user_preferences", content="用户偏好简体中文…")',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Memory topic key (letters/digits/_-. and CJK, max 64 chars)' },
        content: { type: 'string', description: 'Memory content to store (max 200KB)' },
      },
      required: ['topic', 'content'],
    },
  },
  {
    name: 'memory_recall',
    description: [
      'Recall long-term memories by topic keyword (exact match first, then fuzzy by filename contains).',
      'Returns matching memory contents; empty result means nothing stored under that topic yet.',
      'Example: memory_recall(topic="user_preferences")',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic keyword to search (substring match on memory topic)' },
      },
      required: ['topic'],
    },
  },
  {
    name: 'memory_list',
    description: 'List all memory topics (file names without extension) and each file size.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
]

export async function dispatchMemory(name: string, args: Record<string, unknown>): Promise<McpTextResult> {
  switch (name) {
    case 'memory_remember': {
      const topic = sanitizeTopic(String(args.topic ?? ''))
      if (!topic) return textResult('topic 非法：仅允许字母/数字/_-.和中文，最长 64 字符，禁止路径分隔符', true)
      const content = String(args.content ?? '')
      if (!content.trim()) return textResult('content 不能为空', true)
      if (Buffer.byteLength(content, 'utf8') > MAX_MEMORY_BYTES) {
        return textResult(`content 超过上限（${MAX_MEMORY_BYTES} 字节）`, true)
      }
      const root = ensureDir()
      const file = join(root, `${topic}.md`)
      let backedUp = false
      if (existsSync(file) && statSync(file).isFile()) {
        // 覆盖前自动备份旧内容：<topic>.md.bak 保留最近一次覆盖前版本
        writeFileSync(`${file}.bak`, readFileSync(file, 'utf8'), 'utf8')
        backedUp = true
      }
      writeFileSync(file, content, 'utf8')
      return textResult(
        `已记忆 topic="${topic}" → ${file}（${Buffer.byteLength(content, 'utf8')} 字节${backedUp ? '；旧内容已备份至 .bak' : ''}）`,
      )
    }

    case 'memory_recall': {
      const query = String(args.topic ?? '')
      if (!query) return textResult('topic 不能为空', true)
      if (!isSafeQuery(query)) return textResult('topic 非法：禁止路径穿越（.. 或路径分隔符），最长 80 字符', true)
      const root = ensureDir()
      const exact = join(root, `${query}.md`)
      if (existsSync(exact) && statSync(exact).isFile()) {
        return textResult(`【记忆: ${query}】\n${readFileSync(exact, 'utf8')}`)
      }
      // 模糊匹配：文件名包含关键词
      let names: string[] = []
      try {
        names = readdirSync(root)
      } catch {
        names = []
      }
      const hits = names
        .filter((n) => n.endsWith('.md') && n.toLowerCase().includes(query.toLowerCase()))
        .sort()
      if (hits.length === 0) return textResult(`未找到 topic 含「${query}」的记忆（可先用 memory_list 查看全部主题）`)
      const parts = hits.map((n) => {
        const topic = n.slice(0, -3)
        return `【记忆: ${topic}】\n${readFileSync(join(root, n), 'utf8')}`
      })
      return textResult(parts.join('\n\n---\n\n'))
    }

    case 'memory_list': {
      const root = ensureDir()
      let names: string[] = []
      try {
        names = readdirSync(root)
      } catch {
        names = []
      }
      const topics = names
        .filter((n) => n.endsWith('.md'))
        .map((n) => {
          const size = existsSync(join(root, n)) ? statSync(join(root, n)).size : 0
          return `- ${basename(n, '.md')}（${size} 字节）`
        })
        .sort()
      if (topics.length === 0) return textResult(`记忆库为空：${root}（用 memory_remember 写入第一条）`)
      return textResult(`记忆库目录：${root}\n${topics.join('\n')}`)
    }

    default:
      return textResult(`Unknown memory tool: ${name}`, true)
  }
}
