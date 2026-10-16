import { ProjectStore } from './store.mjs'
import { projectHandoff, promptHandoff } from './handoff.mjs'
export { ProjectStore } from './store.mjs'
export { GovernanceError } from './contract.mjs'
export { projectHandoff } from './handoff.mjs'

/** Read-only restoration on the existing Harness prompt seam. No tool/permission changes. */
export function registerProjectHandoff(ctx, store) {
  return ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const assembled = await next()
    const root = context.agent?.session?.header?.cwd
    if (!root) return assembled
    let handoff
    try {
      const loaded = await store.read(root)
      if (loaded.status === 'NOT_FOUND') return assembled
      handoff = projectHandoff(loaded)
    } catch (error) {
      // Ordinary non-Godot workspaces have no project state to restore.
      if (['ENOENT', 'NOT_GODOT_PROJECT'].includes(error.code)) return assembled
      ctx.logger?.warn?.('godot-governance handoff: %s', error.code ?? error.name)
      handoff = { status: 'RECOVERY_REQUIRED', code: error.code ?? 'READ_FAILED', executionAuthorized: false, recommendedNextAction: 'Inspect the project journal; prior progress and authorization are not confirmed.' }
    }
    context.signal?.throwIfAborted()
    if (context.agent?.session?.header?.cwd !== root) return assembled
    return { ...assembled, contexts: [...assembled.contexts.filter(item => item.name !== 'godot-project-handoff'), { name: 'godot-project-handoff', text: promptHandoff(handoff) }] }
  })
}

export function createProjectStore(home) { return new ProjectStore(home) }
