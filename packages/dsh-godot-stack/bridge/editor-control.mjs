import { randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

const key = path => {
  let canonical = resolve(path)
  try { canonical = realpathSync.native(canonical) }
  catch (error) {
    // A project can disappear while its editor is closing; let its lease expire.
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error
  }
  return process.platform === 'win32' ? canonical.toLowerCase() : canonical
}
const invalid = (message, status = 409) => Object.assign(Error(message), { status })

/** The editor owns native actions. Commands expire rather than replaying after reconnect. */
export class EditorControl {
  constructor({ timeoutMs = 12000, leaseMs = 4000 } = {}) {
    this.timeoutMs = timeoutMs
    this.leaseMs = leaseMs
    this.editors = new Map()
    this.pending = new Map()
  }

  poll({ projectPath, editorId, results = [] }) {
    if (typeof projectPath !== 'string' || !projectPath.trim() || typeof editorId !== 'string' || !/^[\w-]{1,100}$/.test(editorId) || !Array.isArray(results)) throw invalid('invalid editor heartbeat', 400)
    const project = key(projectPath)
    const previous = this.editors.get(project)
    if (previous && previous.editorId !== editorId && Date.now() - previous.seen < this.leaseMs) throw invalid('another editor owns this project')
    this.editors.set(project, { editorId, seen: Date.now() })
    for (const result of results) {
      const pending = this.pending.get(result?.id)
      if (!pending || pending.project !== project || pending.editorId !== editorId) throw invalid('unknown or expired editor command')
      pending.finish(result.result)
    }
    return [...this.pending].filter(([, item]) => item.project === project && item.editorId === editorId && !item.delivered)
      .map(([id, item]) => { item.delivered = true; return { id, action: item.action, expiresAt: item.expiresAt } })
  }

  execute({ projectPath, action }) {
    if (typeof projectPath !== 'string' || !projectPath.trim() || !['status', 'scan', 'play', 'stop'].includes(action)) throw invalid('invalid editor action', 400)
    const project = key(projectPath)
    const editor = this.editors.get(project)
    if (!editor || Date.now() - editor.seen >= this.leaseMs) throw invalid('Godot editor is not connected', 503)
    // Serial ownership prevents two agents issuing Play/Stop concurrently in one editor.
    if ([...this.pending.values()].some(item => item.project === project)) throw invalid('editor command already in progress')
    return new Promise((resolve, reject) => {
      const id = randomUUID()
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(invalid('editor command timed out; outcome unknown, inspect status before retry', 504))
      }, this.timeoutMs)
      const finish = result => {
        clearTimeout(timer)
        this.pending.delete(id)
        if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') return reject(invalid('invalid editor result', 502))
        resolve(result)
      }
      this.pending.set(id, { project, editorId: editor.editorId, action, expiresAt: Date.now() + this.timeoutMs, delivered: false, finish, reject, timer })
    })
  }

  stop() {
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(invalid('editor bridge stopped', 503)) }
    this.pending.clear()
    this.editors.clear()
  }
}
