Warning: fs was declared with const; use let for reassignable variables.
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { evaluateGate, HEADLESS_POLICY, TASK_REVIEW_POLICY } from '../packages/dsh-godot-stack/governance/gate.mjs'
import { fingerprintProject } from '../packages/dsh-godot-stack/governance/fingerprint.mjs'
import { ProjectStore } from '../packages/dsh-godot-stack/governance/index.mjs'

const context = { status: 'READY', projectId: 'project', taskId: 'task', runId: 'run', stateRevision: 4, scope: 'player only', inputFingerprint: 'input', environmentFingerprint: 'environment' }
const evidence = { ...context, id: 'proof', kind: 'godot_headless', collector: 'godot-project-verify/v1', provenance: 'ADAPTER_CAPTURED', target: 'headless', runState: 'DONE', outcome: 'PASS', assertions: ['godot.verify'] }
const verdict = (items, ctx = context, policy = HEADLESS_POLICY, humans = []) => evaluateGate(policy, ctx, items, humans).verdict
it('keeps headless success separate from device evidence and human task completion', () => {
  expect(verdict([evidence])).toBe('PASS')
  expect(verdict([evidence], context, TASK_REVIEW_POLICY)).toBe('WAIT_HUMAN')
  const device = { ...HEADLESS_POLICY, gateId: 'ANDROID-ACCESS', requirements: [{ ...HEADLESS_POLICY.requirements[0], id: 'android', kind: 'device', target: 'android' }] }
  expect(verdict([evidence], context, device)).toBe('WAIT_EVIDENCE')
  expect(verdict([{ ...evidence, kind: 'device', target: 'android', provenance: 'AGENT_REPORTED' }], context, device)).toBe('WAIT_EVIDENCE')
})
it('rejects stale input, environment, run, project, missing assertions and untrusted provenance', () => {
  for (const field of ['inputFingerprint', 'environmentFingerprint', 'runId', 'projectId', 'taskId', 'collector', 'target', 'provenance']) expect(verdict([{ ...evidence, [field]: 'other' }])).toBe('WAIT_EVIDENCE')
  expect(verdict([{ ...evidence, assertions: [] }])).toBe('WAIT_EVIDENCE')
  expect(verdict([{ ...evidence, runState: 'RUNNING' }])).toBe('WAIT_EVIDENCE')
  expect(verdict([], { ...context, inputFingerprint: null })).toBe('UNKNOWN')
  expect(verdict([evidence], { ...context, status: 'RECOVERY_REQUIRED' })).toBe('UNKNOWN')
})
it('replays repair, stop and uncertain results without promoting an earlier PASS', () => {
  expect(verdict([evidence, { ...evidence, id: 'failed', outcome: 'FAIL' }])).toBe('REPAIR')
  expect(verdict([{ ...evidence, outcome: 'FAIL' }, evidence])).toBe('PASS')
  expect(verdict([evidence, { ...evidence, outcome: 'UNKNOWN' }])).toBe('UNKNOWN')
  expect(verdict([evidence], { ...context, unresolved: 'timed-out-action', inputFingerprint: 'new-input' })).toBe('UNKNOWN')
  expect(verdict([evidence], { ...context, stopRule: 'explicit-unacceptable-condition' })).toBe('STOP')
})
it('requires a named human answer to the exact current question, scope, policy and revision', () => {
  const answer = { ...context, actor: { kind: 'HUMAN', id: 'Fixture owner' }, question: TASK_REVIEW_POLICY.humanCheckpointRule.question, answer: 'YES', approvedRevision: 4, policyVersion: '1', gateId: TASK_REVIEW_POLICY.gateId, approvedScope: context.scope }
  expect(verdict([evidence], context, TASK_REVIEW_POLICY, [answer])).toBe('PASS')
  for (const field of ['approvedRevision', 'approvedScope', 'question', 'runId', 'gateId', 'policyVersion']) expect(verdict([evidence], context, TASK_REVIEW_POLICY, [{ ...answer, [field]: 'wrong' }])).toBe('WAIT_HUMAN')
  expect(verdict([evidence], context, TASK_REVIEW_POLICY, [{ ...answer, answer: 'NO' }])).toBe('REPAIR')
  const stopPolicy = { ...TASK_REVIEW_POLICY, humanCheckpointRule: { ...TASK_REVIEW_POLICY.humanCheckpointRule, negativeVerdict: 'STOP' } }
  expect(verdict([evidence], context, stopPolicy, [{ ...answer, answer: 'NEEDS_CHANGE' }])).toBe('STOP')
})

const roots = []
afterEach(async () => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 5 }) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'godot-witness-')); roots.push(root)
  const home = join(root, 'home'), project = join(root, 'game')
  await mkdir(project); await mkdir(join(home, '.godot'), { recursive: true })
  await writeFile(join(project, 'project.godot'), 'config_version=5\n[application]\nconfig/name="Witness fixture"\nrun/main_scene="res://main.tscn"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n')
  await writeFile(join(project, 'main.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://main.gd" id="1"]\n[node name="Main" type="Node"]\nscript=ExtResource("1")\n')
  await writeFile(join(project, 'main.gd'), 'extends Node\nfunc _ready():\n\tprint("WITNESS_READY")\n')
  const store = new ProjectStore(home)
  let state = await store.create(project, { actor: { kind: 'HUMAN', id: 'fixture' }, reason: 'Isolated witness test' })
  state = await store.commit(project, { projectId: state.projectId, expectedStateRevision: state.stateRevision, actor: { kind: 'HUMAN', id: 'fixture' }, reason: 'Fixture task', changes: { currentTask: { id: 'fixture-task', runId: 'fixture-run', intent: 'Check fixture compilation', boundary: 'Fixture scripts only', stop: 'Stop on mismatch', stage: 'WITNESS', progress: 'Not verified', unverifiedChanges: ['Human behavior'], stopReason: null, recommendedNextAction: 'Run WITNESS', requiresHuman: 'Confirm fixture behavior' } } })
  return { root, home, project, store, state }
}
it('fingerprints saved files conservatively while ignoring only generated Git/Godot state', async () => {
  const f = await fixture()
  const before = await fingerprintProject(f.project)
  for (const name of ['.git', '.godot']) { await mkdir(join(f.project, name)); await writeFile(join(f.project, name, 'cache'), 'changed') }
  expect((await fingerprintProject(f.project)).fingerprint).toBe(before.fingerprint)
  await writeFile(join(f.project, 'main.gd'), 'extends Node\n# external edit\n')
  expect((await fingerprintProject(f.project)).fingerprint).not.toBe(before.fingerprint)
})

describe.skipIf(!process.env.GODOT_TEST_BIN)('real generated Godot witness collector', () => {
  let createWitnessService
  beforeAll(async () => {
    execFileSync(process.execPath, ['scripts/build-godot-runtime.mjs', '--no-project', '--output', '.build/witness-test-runtime'], { windowsHide: true, stdio: 'pipe' })
    ;({ createWitnessService } = await import(pathToFileURL(resolve('.build/witness-test-runtime/governance/witness.mjs')).href))
  }, 60000)
  async function live() {
    const f = await fixture()
    for (const key of ['APPDATA', 'LOCALAPPDATA', 'HOME', 'USERPROFILE']) { const path = join(f.root, 'os-' + key); await mkdir(path); vi.stubEnv(key, path) }
    await writeFile(join(f.home, '.godot/godot-path.txt'), process.env.GODOT_TEST_BIN)
    return { ...f, service: createWitnessService(f.store, f.home) }
  }
  const request = state => ({ projectId: state.projectId, expectedStateRevision: state.stateRevision })
  it('captures PASS, external STALE, real compile REPAIR, recovery PASS and sealed receipt corruption', async () => {
    const f = await live()
    expect((await f.service.report(f.project)).technicalGate.verdict).toBe('WAIT_EVIDENCE')
    await expect(f.service.run(f.project, { ...request(f.state), projectId: 'another-project' })).rejects.toMatchObject({ code: 'CONFLICT' })
    let report = await f.service.run(f.project, request(f.state))
    expect(report.technicalGate.verdict).toBe('PASS')
    expect(report.taskGate.verdict).toBe('WAIT_HUMAN')
    expect(report.executionAuthorized).toBe(false)
    const validScript = await readFile(join(f.project, 'main.gd'), 'utf8')
    await writeFile(join(f.project, 'main.gd'), validScript + '\nfunc broken(:\n')
    expect((await f.service.report(f.project)).technicalGate.verdict).toBe('WAIT_EVIDENCE')
    report = await f.service.run(f.project, request((await f.store.read(f.project)).state))
    expect(report.technicalGate.verdict).toBe('REPAIR')
    await writeFile(join(f.project, 'main.gd'), validScript)
    report = await f.service.run(f.project, request((await f.store.read(f.project)).state))
    expect(report.technicalGate.verdict).toBe('PASS')
    const reopened = createWitnessService(new ProjectStore(f.home), f.home)
    expect((await reopened.report(f.project)).technicalGate).toEqual(report.technicalGate)
    const identity = await f.store.identity(f.project)
    const latest = (await f.store.read(f.project)).state.observations.at(-1)
    await writeFile(join(identity.directory, latest.artifactRefs[0]), 'damaged')
    report = await reopened.report(f.project)
    expect(report.technicalGate.verdict).not.toBe('PASS')
    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'UNTRUSTED_WITNESS_RECEIPT' }))
    await expect(reopened.run(f.project, request((await f.store.read(f.project)).state))).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' })
  }, 60000)
  it('persists UNKNOWN before execution, rejects concurrent runs and prevents blind replay after a final commit conflict', async () => {
    const f = await live()
    const finished = f.service.run(f.project, request(f.state)).then(value => ({ value }), error => ({ error }))
    let running
    await vi.waitFor(async () => {
      running = (await f.store.read(f.project)).state
      expect(running.observations.at(-1)?.outcome).toBe('UNKNOWN')
    }, { interval: 10, timeout: 10000 })
    await expect(f.service.run(f.project, request(f.state))).rejects.toMatchObject({ code: 'WITNESS_BUSY' })
    await f.store.commit(f.project, { projectId: running.projectId, expectedStateRevision: running.stateRevision, actor: { kind: 'HUMAN', id: 'other-window' }, reason: 'Concurrent progress edit', changes: { currentTask: { ...running.currentTask, progress: 'Other window changed the record' } } })
    expect((await finished).error).toMatchObject({ code: 'CONFLICT' })
    expect((await f.service.report(f.project)).technicalGate.verdict).toBe('UNKNOWN')
    await expect(f.service.run(f.project, request((await f.store.read(f.project)).state))).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' })
  }, 60000)
})
