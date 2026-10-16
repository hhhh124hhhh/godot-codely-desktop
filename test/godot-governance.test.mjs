import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, expect, it } from 'vitest'
import { ProjectStore, projectHandoff, registerProjectHandoff } from '../packages/dsh-godot-stack/governance/index.mjs'

const roots = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const human = { kind: 'HUMAN', id: 'test-owner' }
const agent = { kind: 'AGENT', id: 'agent-one' }
const task = (progress = 'Implemented, awaiting independent verification') => ({ id: 'TASK-1', runId: 'run-1', intent: 'Restore project facts', boundary: 'State persistence only', stop: 'Stop if integrity is unknown', stage: 'IMPLEMENT', progress, unverifiedChanges: ['Android access has not been checked'], stopReason: 'WAIT_HUMAN', recommendedNextAction: 'Review the captured verification and original boundary', requiresHuman: 'Does the restored handoff contain the facts you need?' })
const revision = { contentFingerprint: 'sha256:input-one', gitHead: null, godotVersion: '4.5.1' }
const evidence = (state, outcome = 'FAIL', provenance = 'ADAPTER_CAPTURED') => ({ id: 'EV-1', projectId: state.projectId, taskId: 'TASK-1', runId: 'run-1', kind: 'integration', provenance, outcome, inputFingerprint: revision.contentFingerprint, environmentFingerprint: 'node:test-environment', assertions: ['Expected resumed state matches committed input'], artifactRefs: ['evidence/run-1.txt'], limitations: ['Not a Godot device or FUN test'], observedAt: '2026-10-16T00:00:00Z' })
const command = (state, changes, who = agent) => ({ projectId: state.projectId, expectedStateRevision: state.stateRevision, expectedImplementationFingerprint: state.implementationRevision.contentFingerprint, actor: who, reason: 'Explicit G1b test record', changes })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'godot-g1b-')); roots.push(root)
  const project = join(root, 'project'); const home = join(root, 'home')
  await mkdir(project); await writeFile(join(project, 'project.godot'), 'config_version=5\n')
  const store = new ProjectStore(home)
  const initial = await store.create(project, { actor: human, reason: 'Enroll isolated no-Git project' })
  const state = await store.commit(project, command(initial, { currentTask: task(), implementationRevision: revision }))
  return { root, project, home, store, state }
}
async function worker(f, mode, cmd) {
  try { const r = await promisify(execFile)(process.execPath, [resolve('test/fixtures/governance-worker.mjs'), f.home, f.project, mode, JSON.stringify(cmd ?? {})], { windowsHide: true }); return JSON.parse(r.stdout) }
  catch (error) { if (error.code === 73) return { code: 'CRASHED' }; if (error.stdout) return JSON.parse(error.stdout); throw error }
}
const directory = async f => (await f.store.identity(f.project)).directory
const grant = state => ({ delegationId: 'delegation-1', projectId: state.projectId, taskId: 'TASK-1', intent: 'Preserve the existing contract', boundary: 'Local project state only', stop: 'No publishing or unattended execution', allowedActions: ['record project progress'], forbiddenActions: ['publish', 'change gameplay'], approvedBy: human, approvedStateRevision: state.stateRevision + 1, approvedPolicyVersion: state.policyVersion, expiresAt: '2020-01-01T00:00:00Z', budget: { maxRuns: 2, maxToolCalls: 20, usedRuns: 1, usedToolCalls: 3 }, status: 'RECORDED', triggerMode: 'MANUAL', triggerStatus: 'NOT_AVAILABLE' })

it('restores progress, boundaries and unchanged verification outcomes in fresh processes without Git', async () => {
  const f = await fixture()
  let state = await f.store.commit(f.project, command(f.state, { delegation: grant(f.state) }, human))
  state = await f.store.commit(f.project, command(state, { appendObservations: [evidence(state)] }))
  const [first, switched] = await Promise.all([worker(f, 'read'), worker(f, 'read')])
  expect(first.state).toEqual(state); expect(switched.handoff).toEqual(first.handoff)
  expect(first.handoff.task).toEqual(task())
  expect(first.handoff.verificationRecords[0]).toMatchObject({ outcome: 'FAIL', provenance: 'ADAPTER_CAPTURED' })
  expect(first.handoff).toMatchObject({ authorizationRecordStatus: 'EXPIRED', executionAuthorized: false, trigger: 'MANUAL+RESUMABLE' })
  expect(first.state.delegation).toEqual(state.delegation)
  expect(first.decisions.map(d => d.actualStateRevision)).toEqual([0, 1, 2, 3])
  expect(JSON.stringify(first.handoff)).not.toContain(f.project.replaceAll('\\', '\\\\'))
})
it('atomically permits exactly one same-revision writer across two real Node processes', async () => {
  const f = await fixture()
  const results = await Promise.all(['one', 'two'].map(value => worker(f, 'commit', command(f.state, { currentTask: task(value) }))))
  expect(results.filter(result => result.code === 'CONFLICT')).toHaveLength(1)
  expect(results.filter(result => result.stateRevision === 2)).toHaveLength(1)
  const current = await f.store.read(f.project)
  expect(current.status).toBe('READY'); expect(current.decisions).toHaveLength(3)
  expect(['one', 'two']).toContain(current.state.currentTask.progress)
})
it('ignores unpublished staging after an actual process crash and accepts a new valid commit', async () => {
  const f = await fixture()
  expect(await worker(f, 'crash', command(f.state, { currentTask: task('never committed') }))).toEqual({ code: 'CRASHED' })
  expect((await readdir(await directory(f))).some(name => name.startsWith('.pending-'))).toBe(true)
  expect((await worker(f, 'read')).state).toEqual(f.state)
  const updated = await f.store.commit(f.project, command(f.state, { currentTask: task('committed after restart') }))
  expect(updated.stateRevision).toBe(2)
})
it('recovers the exact committed revision from an independent checked replica without rewriting damaged bytes', async () => {
  const f = await fixture(); const path = join(await directory(f), 'r-0000000001', 'record.json')
  await writeFile(path, '{interrupted')
  const restored = await worker(f, 'read')
  expect(restored.status).toBe('RECOVERED'); expect(restored.state).toEqual(f.state)
  expect(restored.issues).toContainEqual({ revision: 1, code: 'REPLICA_USED' })
  expect(await readFile(path, 'utf8')).toBe('{interrupted')
  expect((await f.store.commit(f.project, command(f.state, { currentTask: task('recovered') }))).stateRevision).toBe(2)
})
it('preserves double corruption and exposes only a historical last-verified state, blocking writes', async () => {
  const f = await fixture(); const path = join(await directory(f), 'r-0000000001')
  await writeFile(join(path, 'record.json'), 'damaged primary'); await writeFile(join(path, 'replica.json'), 'damaged replica')
  const restored = await worker(f, 'read')
  expect(restored.status).toBe('RECOVERY_REQUIRED'); expect(restored.state.stateRevision).toBe(0)
  expect(restored.handoff).toMatchObject({ executionAuthorized: false, status: 'RECOVERY_REQUIRED' })
  await expect(f.store.commit(f.project, command(f.state, { currentTask: task('must not overwrite') }))).rejects.toMatchObject({ code: 'RECOVERY_REQUIRED' })
  expect(await readFile(join(path, 'record.json'), 'utf8')).toBe('damaged primary')
})
it('rejects late revision, run, project and input results without touching the journal', async () => {
  const f = await fixture()
  const pending = evidence(f.state)
  const updated = await f.store.commit(f.project, command(f.state, { currentTask: { ...task(), runId: 'run-2' } }))
  await expect(f.store.commit(f.project, command(f.state, { appendObservations: [pending] }))).rejects.toMatchObject({ code: 'CONFLICT' })
  await expect(f.store.commit(f.project, command(updated, { appendObservations: [pending] }))).rejects.toMatchObject({ code: 'CONFLICT' })
  await expect(f.store.commit(f.project, { ...command(updated, { currentTask: task() }), projectId: 'another-project' })).rejects.toMatchObject({ code: 'CONFLICT' })
  await expect(f.store.commit(f.project, { ...command(updated, { currentTask: task() }), expectedImplementationFingerprint: 'old-input' })).rejects.toMatchObject({ code: 'CONFLICT' })
  expect((await f.store.read(f.project)).state).toEqual(updated)
})
it('does not turn AGENT_REPORTED PASS or UNKNOWN into a Gate result or renewed authorization', async () => {
  const f = await fixture()
  const observations = [evidence(f.state, 'PASS', 'AGENT_REPORTED'), { ...evidence(f.state, 'UNKNOWN'), id: 'EV-2' }]
  const state = await f.store.commit(f.project, command(f.state, { appendObservations: observations }))
  const handoff = projectHandoff(await f.store.read(f.project))
  expect(handoff.verificationRecords.map(item => [item.outcome, item.provenance])).toEqual([['PASS', 'AGENT_REPORTED'], ['UNKNOWN', 'ADAPTER_CAPTURED']])
  expect(handoff).not.toHaveProperty('gateVerdict'); expect(handoff.executionAuthorized).toBe(false)
  await expect(f.store.commit(f.project, command(state, { appendObservations: observations }))).rejects.toMatchObject({ code: 'INVALID_RECORD' })
})
it('keeps frozen design separate from implementation and records adoption without historical Gate PASS', async () => {
  const f = await fixture()
  await expect(f.store.commit(f.project, command(f.state, { adoptPhase: 'BUILD' }))).rejects.toMatchObject({ code: 'INVALID_RECORD' })
  const state = await f.store.commit(f.project, command(f.state, { adoptPhase: 'BUILD', designBaselineRef: { id: 'design-1', sourceRef: 'reference/design.md', sourceFingerprint: 'sha256:design' } }, human))
  expect(state.lifecycleProvenance).toMatchObject({ kind: 'USER_ADOPTION', historicalEvidence: 'UNVERIFIED' })
  expect(state.designBaselineRef.sourceFingerprint).not.toBe(state.implementationRevision.contentFingerprint)
  const updated = await f.store.commit(f.project, command(state, { implementationRevision: { ...revision, contentFingerprint: 'sha256:input-two' } }))
  expect(updated.designBaselineRef).toEqual(state.designBaselineRef)
  await expect(f.store.commit(f.project, command(updated, { adoptPhase: 'OPERATE' }, human))).rejects.toMatchObject({ code: 'INVALID_RECORD' })
})
it('invalidates a recorded contract basis when state or policy changes, keeping original approval untouched', async () => {
  const f = await fixture()
  const delegation = { ...grant(f.state), expiresAt: '2099-01-01T00:00:00Z' }
  const state = await f.store.commit(f.project, command(f.state, { delegation }, human))
  expect(projectHandoff(await f.store.read(f.project)).authorizationRecordStatus).toBe('RECORDED')
  await f.store.commit(f.project, command(state, { policyVersion: '2' }))
  const restored = projectHandoff(await f.store.read(f.project))
  expect(restored.authorizationRecordStatus).toBe('VERSION_MISMATCH'); expect(restored.delegation).toEqual(delegation)
  expect(restored.executionAuthorized).toBe(false)
})
it('isolates projects and resolves a Windows junction to the same stable identity', async () => {
  const f = await fixture(); const other = join(f.root, 'other'); await mkdir(other); await writeFile(join(other, 'project.godot'), 'config_version=5\n')
  const state = await f.store.create(other, { actor: human, reason: 'Separate project' })
  expect(state.projectId).not.toBe(f.state.projectId); expect(state.currentTask).toBeNull()
  const link = join(f.root, 'project-link'); await symlink(f.project, link, process.platform === 'win32' ? 'junction' : 'dir')
  expect((await f.store.read(link)).state).toEqual(f.state)
})
async function rewriteGenesis(f, version) {
  const path = join(await directory(f), 'r-0000000000')
  const record = JSON.parse(await readFile(join(path, 'record.json'), 'utf8'))
  record.schemaVersion = version
  if (version === 0) { delete record.state.governanceMode; delete record.state.delegation; delete record.state.schemaVersion }
  const data = JSON.stringify(record)
  await writeFile(join(path, 'record.json'), data); await writeFile(join(path, 'replica.json'), data)
  await writeFile(join(path, 'manifest.json'), JSON.stringify({ sha256: createHash('sha256').update(data).digest('hex') }))
  return { path, data }
}
it('migrates explicit v0 imports without inventing delegation and refuses a newer schema', async () => {
  const f = await fixture()
  // Use a genesis-only import to avoid creating an intentionally broken parent chain.
  await rm(join(await directory(f), 'r-0000000001'), { recursive: true })
  const original = await rewriteGenesis(f, 0)
  const loaded = await f.store.read(f.project)
  expect(loaded.state).toMatchObject({ schemaVersion: 1, governanceMode: 'OBSERVED', delegation: null })
  await f.store.commit(f.project, command(loaded.state, { currentTask: task(), implementationRevision: revision }))
  expect(await readFile(join(original.path, 'record.json'), 'utf8')).toBe(original.data)
  expect((await f.store.read(f.project)).state.stateRevision).toBe(1)
  const newer = await fixture(); await rewriteGenesis(newer, 99)
  await expect(newer.store.read(newer.project)).rejects.toMatchObject({ code: 'UNSUPPORTED_SCHEMA' })
})
it('restores only the selected Agent project, reports unreadable authority, and unregisters its seam', async () => {
  const f = await fixture(); let listener; let disposed = false
  const ctx = { on: (_event, fn) => { listener = fn; return () => { disposed = true } }, logger: { warn() {} } }
  const dispose = registerProjectHandoff(ctx, f.store)
  const base = { contexts: [], tools: [{ name: 'write' }], sections: [], variables: {} }
  const context = { agent: { session: { header: { cwd: f.project } } } }
  const restored = await listener(base, context, async () => base)
  expect(restored.tools).toEqual(base.tools); expect(restored.contexts).toHaveLength(1)
  expect(restored.contexts[0].text).toContain(f.state.projectId)
  const other = join(f.root, 'unmanaged'); await mkdir(other); await writeFile(join(other, 'project.godot'), 'config_version=5\n')
  expect(await listener(base, { agent: { session: { header: { cwd: other } } } }, async () => base)).toEqual(base)
  await rewriteGenesis(f, 99)
  expect((await listener(base, context, async () => base)).contexts[0].text).toContain('RECOVERY_REQUIRED')
  dispose(); expect(disposed).toBe(true)
})

it('detects damage in the recovery copy even when the primary is readable', async () => {
  const f = await fixture()
  await writeFile(join(await directory(f), 'r-0000000001', 'replica.json'), 'damaged recovery copy')
  const restored = await f.store.read(f.project)
  expect(restored.status).toBe('RECOVERED'); expect(restored.state).toEqual(f.state)
  expect(restored.issues).toContainEqual({ revision: 1, code: 'REPLICA_DAMAGED' })
})
it('detects a missing committed revision instead of trusting a later snapshot', async () => {
  const f = await fixture()
  await f.store.commit(f.project, command(f.state, { currentTask: task('later revision') }))
  await rm(join(await directory(f), 'r-0000000001'), { recursive: true })
  const restored = await f.store.read(f.project)
  expect(restored.status).toBe('RECOVERY_REQUIRED'); expect(restored.state.stateRevision).toBe(0)
})
it('rejects malformed or executable-trigger contracts before creating a new revision', async () => {
  const f = await fixture()
  await expect(f.store.commit(f.project, command(f.state, { delegation: { ...grant(f.state), triggerMode: 'AUTOMATIC' } }, human))).rejects.toMatchObject({ code: 'INVALID_RECORD' })
  await expect(f.store.commit(f.project, command(f.state, { governanceMode: 'ENFORCED' }))).rejects.toMatchObject({ code: 'INVALID_RECORD' })
  await expect(f.store.commit(f.project, command(f.state, { currentTask: { ...task(), boundary: '' } }))).rejects.toMatchObject({ code: 'INVALID_RECORD' })
  expect((await f.store.read(f.project)).state).toEqual(f.state)
})

it('snapshots the submitted command before asynchronous I/O so a caller cannot rewrite an in-flight record', async () => {
  const f = await fixture()
  const submitted = command(f.state, { currentTask: task('original submitted fact') })
  const pending = f.store.commit(f.project, submitted)
  submitted.changes.currentTask.progress = 'mutated after submission'
  expect((await pending).currentTask.progress).toBe('original submitted fact')
})

it('does not attach an old project journal to a different directory recreated at the same path', async () => {
  const f = await fixture()
  const { rename } = await import('node:fs/promises')
  await rename(f.project, join(f.root, 'old-project-preserved'))
  await mkdir(f.project); await writeFile(join(f.project, 'project.godot'), 'config_version=5\n')
  expect((await f.store.read(f.project)).status).toBe('NOT_FOUND')
  const replacement = await f.store.create(f.project, { actor: human, reason: 'Explicit replacement project enrollment' })
  expect(replacement.projectId).not.toBe(f.state.projectId)
  expect(replacement.currentTask).toBeNull()
})

it('refuses a v0 import carrying unknown authorization fields instead of silently discarding them', async () => {
  const f = await fixture()
  await rm(join(await directory(f), 'r-0000000001'), { recursive: true })
  const imported = await rewriteGenesis(f, 0)
  const record = JSON.parse(imported.data)
  record.state.delegation = grant(f.state)
  const data = JSON.stringify(record)
  await writeFile(join(imported.path, 'record.json'), data); await writeFile(join(imported.path, 'replica.json'), data)
  await writeFile(join(imported.path, 'manifest.json'), JSON.stringify({ sha256: createHash('sha256').update(data).digest('hex') }))
  await expect(f.store.read(f.project)).rejects.toMatchObject({ code: 'UNSUPPORTED_SCHEMA' })
})
