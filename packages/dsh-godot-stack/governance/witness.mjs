Warning: fs was declared with const; use let for reassignable variables.
import { execFile } from 'node:child_process'
import { open, mkdir, readFile, realpath, lstat } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import * as c from './contract.mjs'
import { digest, fingerprintProject } from './fingerprint.mjs'
import { evaluateGate, HEADLESS_POLICY, TASK_REVIEW_POLICY } from './gate.mjs'

// Harness's builtin carrier may wrap execFile without Node's custom promisify symbol.
const execute = (file, args, options) => new Promise((resolve, reject) => {
  execFile(file, args, options, (error, stdout, stderr) => {
    if (error) reject(Object.assign(error, { stdout, stderr }))
    else resolve({ stdout, stderr })
  })
})
const COLLECTOR = 'godot-project-verify/v1'
const MAX_RECEIPT_BYTES = 4 * 1024 * 1024
const assertInside = (root, path) => {
  const local = relative(root, path)
  if (!local || local === '..' || local.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) || isAbsolute(local)) c.fail('CORRUPT_RECORD', 'witness receipt escaped project journal')
}

/** Trusted Node collector. User input selects an existing task revision only, never a path or result.
 * @param {import('./index.mjs').ProjectStore} store
 * @param {string} home actual host-selected DSH_HOME
 */
export function createWitnessService(store, home) {
  const pending = new Set()
  let disposed = false
  async function environment() {
    let path
    try { path = (await readFile(join(home, '.godot/godot-path.txt'), 'utf8')).trim() }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    path ||= process.env.GODOT_PATH
    if (!path || !isAbsolute(path)) c.fail('ENGINE_MISSING', 'select a Godot executable before WITNESS')
    path = await realpath(path)
    const { stdout } = await execute(path, ['--version'], { windowsHide: true, timeout: 5000, maxBuffer: 8192 })
    const version = stdout.trim()
    if (!/^4\.[1-9]\d*\./.test(version)) c.fail('ENGINE_VERSION', 'WITNESS requires Godot 4.1 or newer')
    const collectorDigest = digest(await readFile(new URL('./validator.mjs', import.meta.url)))
    const descriptor = { collector: COLLECTOR, collectorDigest, godotVersion: version, executable: path, platform: process.platform, arch: process.arch, node: process.versions.node, frames: 60 }
    return { path, version, fingerprint: digest(JSON.stringify(descriptor)), descriptor }
  }
  async function receiptDirectory(root) {
    const identity = await store.identity(root)
    const directory = join(identity.directory, 'witness')
    await mkdir(directory, { recursive: true })
    if ((await lstat(directory)).isSymbolicLink()) c.fail('CORRUPT_RECORD', 'witness directory must not be a link')
    assertInside(await realpath(identity.directory), await realpath(directory))
    return directory
  }
  async function saveReceipt(root, receipt) {
    const raw = JSON.stringify(receipt)
    if (Buffer.byteLength(raw) > MAX_RECEIPT_BYTES) c.fail('RECEIPT_TOO_LARGE', 'witness output exceeds supported receipt size')
    const sha = digest(raw)
    const file = await open(join(await receiptDirectory(root), sha + '.json'), 'wx', 0o600)
    try { await file.writeFile(raw); await file.sync() } finally { await file.close() }
    return 'witness/' + sha + '.json'
  }
  async function readEvidence(root, loaded) {
    const evidence = []
    const issues = []
    if (!loaded.state) return { evidence, issues }
    const identity = await store.identity(root)
    // Only the latest pair for this task/run can decide this gate. Older observations
    // remain in the journal; do not reread an unbounded lifetime of raw process logs.
    const records = loaded.state.observations.filter(item => item.taskId === loaded.state.currentTask?.id && item.runId === loaded.state.currentTask?.runId && item.kind === 'godot_headless' && item.provenance === 'ADAPTER_CAPTURED').slice(-2)
    for (const record of records) {
      if (record.kind !== 'godot_headless' || record.provenance !== 'ADAPTER_CAPTURED') continue
      try {
        const ref = record.artifactRefs[0]
        if (record.artifactRefs.length !== 1 || !/^witness\/[a-f0-9]{64}\.json$/.test(ref)) throw Error('Missing sealed collector receipt')
        const path = join(identity.directory, ref)
        assertInside(await realpath(identity.directory), await realpath(path))
        const file = await open(path, 'r')
        let raw
        try {
          if ((await file.stat()).size > MAX_RECEIPT_BYTES) throw Error('Receipt too large')
          raw = await file.readFile('utf8')
          if (Buffer.byteLength(raw) > MAX_RECEIPT_BYTES) throw Error('Receipt grew beyond limit')
        } finally { await file.close() }
        if (digest(raw) !== ref.slice(8, -5)) throw Error('Receipt checksum mismatch')
        const receipt = JSON.parse(raw)
        if (receipt.format !== 1 || receipt.collector !== COLLECTOR || receipt.target !== 'headless' || !['RUNNING', 'DONE'].includes(receipt.runState)) throw Error('Unsupported collector receipt')
        for (const key of ['id', 'projectId', 'taskId', 'runId', 'kind', 'provenance', 'outcome', 'inputFingerprint', 'environmentFingerprint', 'observedAt']) if (receipt[key] !== record[key]) throw Error('Receipt and journal disagree: ' + key)
        if (JSON.stringify(receipt.assertions) !== JSON.stringify(record.assertions)) throw Error('Receipt assertions disagree')
        evidence.push(receipt)
      } catch (error) { issues.push({ code: 'UNTRUSTED_WITNESS_RECEIPT', evidenceId: record.id, message: error.message }) }
    }
    return { evidence, issues }
  }
  async function report(root) {
    const loaded = await store.read(root)
    const state = loaded.state
    let input, env, inspectionError
    try {
      if (state && ['READY', 'RECOVERED'].includes(loaded.status)) {
        input = await fingerprintProject(root)
        env = await environment()
        // Double-sample catches concurrent input edits during an asynchronous inspection.
        if ((await fingerprintProject(root)).fingerprint !== input.fingerprint) c.fail('INPUT_CHANGED', 'project changed during inspection')
      }
    } catch (error) { inspectionError = error.code || 'INSPECTION_FAILED' }
    const captured = await readEvidence(root, loaded)
    const latest = captured.evidence.filter(item => item.taskId === state?.currentTask?.id && item.runId === state?.currentTask?.runId).at(-1)
    const context = { status: loaded.status, projectId: state?.projectId, taskId: state?.currentTask?.id, runId: state?.currentTask?.runId, stateRevision: state?.stateRevision, scope: state?.currentTask?.boundary, inputFingerprint: input?.fingerprint, environmentFingerprint: env?.fingerprint, inputStable: !inspectionError && !captured.issues.length, unresolved: latest?.outcome === 'UNKNOWN' ? latest.id : null }
    const technicalGate = evaluateGate(HEADLESS_POLICY, context, captured.evidence)
    const taskGate = evaluateGate(TASK_REVIEW_POLICY, context, captured.evidence)
    return {
      governanceMode: 'OBSERVED', executionAuthorized: false, trigger: 'MANUAL+RESUMABLE',
      projectId: state?.projectId ?? null, basisRevision: state?.stateRevision ?? null,
      currentInputFingerprint: input?.fingerprint ?? null, environment: env?.descriptor ?? null,
      technicalGate, taskGate, inspectionError: inspectionError ?? null,
      latestValidation: latest?.result ?? null,
      evidence: captured.evidence.map(item => ({ id: item.id, kind: item.kind, outcome: item.outcome, runState: item.runState, provenance: item.provenance, target: item.target, runId: item.runId, artifactRefs: ['witness/' + digest(JSON.stringify(item)) + '.json'], validity: item.inputFingerprint === input?.fingerprint && item.environmentFingerprint === env?.fingerprint && item.runId === state?.currentTask?.runId ? 'CURRENT' : 'STALE', startedAt: item.startedAt, completedAt: item.runState === 'DONE' ? item.observedAt : null, limitations: item.limitations })),
      issues: [...loaded.issues, ...captured.issues],
    }
  }
  async function run(root, input) {
    if (disposed) c.fail('WITNESS_STOPPED', 'collector is disposed')
    c.keys(input, ['projectId', 'expectedStateRevision'], 'witness request')
    c.text(input.projectId, 'projectId', 100); c.natural(input.expectedStateRevision, 'expectedStateRevision')
    const identity = await store.identity(root)
    if (pending.has(identity.projectId)) c.fail('WITNESS_BUSY', 'a witness is already running for this project')
    pending.add(identity.projectId)
    try {
      const loaded = await store.read(root)
      if (!['READY', 'RECOVERED'].includes(loaded.status)) c.fail(loaded.status, 'verified project record required')
      const state = loaded.state
      if (state.projectId !== input.projectId || state.stateRevision !== input.expectedStateRevision) c.fail('CONFLICT', 'reload the task before WITNESS')
      if (!state.currentTask) c.fail('TASK_REQUIRED', 'save a task before WITNESS')
      const existing = await readEvidence(root, loaded)
      const latest = existing.evidence.filter(item => item.taskId === state.currentTask.id && item.runId === state.currentTask.runId).at(-1)
      if (existing.issues.length || latest?.outcome === 'UNKNOWN') c.fail('RECONCILIATION_REQUIRED', 'inspect the prior uncertain or damaged receipt before starting another WITNESS')
      const before = await fingerprintProject(root)
      const env = await environment()
      const startedAt = new Date().toISOString()
      const marker = { format: 1, collector: COLLECTOR, target: 'headless', runState: 'RUNNING', id: randomUUID(), projectId: state.projectId, taskId: state.currentTask.id, runId: state.currentTask.runId, kind: 'godot_headless', provenance: 'ADAPTER_CAPTURED', outcome: 'UNKNOWN', inputFingerprint: before.fingerprint, environmentFingerprint: env.fingerprint, assertions: ['godot.verify'], startedAt, observedAt: startedAt, limitations: ['WITNESS started; completion is not confirmed.'], environment: env.descriptor }
      const commitReceipt = async (receipt, expected) => {
        const ref = await saveReceipt(root, receipt)
        const observation = Object.fromEntries(['id', 'projectId', 'taskId', 'runId', 'kind', 'provenance', 'outcome', 'inputFingerprint', 'environmentFingerprint', 'assertions', 'observedAt', 'limitations'].map(key => [key, receipt[key]]))
        return store.commit(root, {
          projectId: state.projectId, expectedStateRevision: expected.stateRevision, expectedImplementationFingerprint: expected.implementationRevision.contentFingerprint,
          actor: { kind: 'ADAPTER', id: COLLECTOR }, reason: 'Actual Godot compile/headless WITNESS; no execution grant or task closure',
          changes: { implementationRevision: { ...expected.implementationRevision, contentFingerprint: before.fingerprint, godotVersion: env.version }, appendObservations: [{ ...observation, artifactRefs: [ref] }] },
        })
      }
      // Publish uncertainty before launching: a crash or failed final commit must not expose an old PASS.
      const running = await commitReceipt(marker, state)
      // Loaded only from the generated self-contained plugin; no repository fallback.
      let result, after, envAfter
      try {
        const { validateProject } = await import('./validator.mjs')
        result = await validateProject(env.path, identity.projectRoot, 60)
        after = await fingerprintProject(root)
        envAfter = await environment()
      } catch (error) { result = { ok: false, phase: 'collector', failureKind: 'INTERRUPTED', code: error.code || error.name } }
      const changed = before.fingerprint !== after?.fingerprint || env.fingerprint !== envAfter?.fingerprint
      const failures = [result, result.compile, result.smoke].filter(Boolean)
      const uncertain = changed || failures.some(value => ['INTERRUPTED', 'START_FAILED'].includes(value.failureKind))
      const receipt = {
        format: 1, collector: COLLECTOR, target: 'headless', runState: 'DONE',
        id: randomUUID(), projectId: state.projectId, taskId: state.currentTask.id, runId: state.currentTask.runId,
        kind: 'godot_headless', provenance: 'ADAPTER_CAPTURED', outcome: uncertain ? 'UNKNOWN' : result.ok ? 'PASS' : 'FAIL',
        inputFingerprint: before.fingerprint, environmentFingerprint: env.fingerprint,
        assertions: ['godot.verify'], startedAt, observedAt: new Date().toISOString(),
        limitations: ['Compile and headless smoke only; no browser, device, gameplay or human UX claim.', ...(changed ? ['Inputs or environment changed during WITNESS; reconcile before retry.'] : [])],
        environment: env.descriptor, beforeFiles: before.files, afterInputFingerprint: after?.fingerprint ?? null,
        result,
      }
      if (disposed) c.fail('WITNESS_STOPPED', 'collector disposed before commit; result not published')
      await commitReceipt(receipt, running)
      return report(root)
    } finally { pending.delete(identity.projectId) }
  }
  return { report, run, dispose() { disposed = true } }
}
