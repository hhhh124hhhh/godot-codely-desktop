/** Shared memory location for the plugin slash commands and the MCP server.
 * Desktop sets DSH_HOME to <userData>/harness; CLI leaves it unset and uses ~/.dsh.
 * Memories ignore that split and stay in ~/.dsh/memories unless GODOT_CODELY_MEMORY_DIR is set.
 * Keep the same rule in godot-mcp-server/src/memory/memory.ts (the MCP bundle cannot import this file).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, sep } from 'node:path'

const MAX_TOPIC_LEN = 64

export function memoryRoot() {
  const override = process.env.GODOT_CODELY_MEMORY_DIR
  if (override) return override
  return join(homedir(), '.dsh', 'memories')
}

export function legacyMemoryDir() {
  const dshHome = process.env.DSH_HOME
  if (!dshHome) return ''
  const legacy = join(dshHome, 'memories')
  if (legacy === memoryRoot()) return ''
  return legacy
}

/** Copy topics that only exist in the desktop harness home. Never overwrite the shared copy. */
export function adoptLegacyMemories() {
  const legacy = legacyMemoryDir()
  const root = memoryRoot()
  if (!legacy || !existsSync(legacy)) return root
  mkdirSync(root, { recursive: true })
  let names = []
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
      // One unreadable legacy file must not block the shared store.
    }
  }
  return root
}

export function sanitizeTopic(topic) {
  if (!topic || topic.length > MAX_TOPIC_LEN) return null
  if (!/^[\w\u4e00-\u9fa5\-._]+$/.test(topic)) return null
  if (topic.includes('..') || topic.includes('/') || topic.includes('\\') || topic.includes(sep)) return null
  return topic
}
