Warning: fs was declared with const; use let for reassignable variables.
import { randomUUID } from 'node:crypto'
import { keys, text, natural, fail } from './contract.mjs'
import { projectHandoff } from './handoff.mjs'

/** Narrow user-record boundary: never accepts policy, delegation or verification writes. */
export async function saveDesktopRecord(store, projectRoot, input) {
  keys(input, ['action', 'actorName', 'projectId', 'expectedStateRevision', 'task'], 'desktop record')
  text(input.actorName, 'actorName', 200)
  const actor = { kind: 'HUMAN', id: input.actorName.trim() }
  if (input.action === 'create') {
    if (input.expectedStateRevision !== null || input.task !== undefined || input.projectId !== undefined) fail('INVALID_RECORD', 'invalid create request')
    await store.create(projectRoot, { actor, reason: 'User created an observed project record in Desktop' })
  } else if (input.action === 'task') {
    natural(input.expectedStateRevision, 'expectedStateRevision')
    text(input.projectId, 'projectId', 100)
    keys(input.task, ['intent', 'boundary', 'stop', 'progress', 'recommendedNextAction'], 'task')
    for (const key of ['intent', 'boundary', 'stop', 'progress', 'recommendedNextAction']) text(input.task[key], key)
    const loaded = await store.read(projectRoot)
    if (loaded.status === 'RECOVERY_REQUIRED') fail('RECOVERY_REQUIRED', 'journal requires recovery')
    if (!loaded.state) fail('CONFLICT', 'create the project record first')
    const previous = loaded.state.currentTask
    const changedScope = previous && ['intent', 'boundary', 'stop'].some(key => previous[key] !== input.task[key])
    await store.commit(projectRoot, {
      projectId: input.projectId, expectedStateRevision: input.expectedStateRevision,
      actor, reason: 'User updated the task and handoff in Desktop',
      changes: { currentTask: {
        ...(previous || { id: randomUUID(), runId: randomUUID(), stage: 'PROBE', unverifiedChanges: [], stopReason: null, requiresHuman: null }),
        ...(changedScope ? { runId: randomUUID() } : {}),
        ...input.task,
      } },
    })
  } else fail('INVALID_RECORD', 'unknown desktop record action')
  return projectHandoff(await store.read(projectRoot))
}
