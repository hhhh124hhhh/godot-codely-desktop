/** Immutable local transactions. Atomic nonempty-directory publication is the CAS point. */
import { mkdir, open, readFile, readdir, realpath, rename, rm, stat, lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import * as c from './contract.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
const normalized = value => process.platform === 'win32' ? value.toLowerCase() : value
const revisionName = revision => 'r-' + String(revision).padStart(10, '0')
const MAX_BYTES = 8 * 1024 * 1024
async function boundedRead(path) {
  const file = await open(path, 'r')
  try {
    if (!(await file.stat()).isFile() || (await file.stat()).size > MAX_BYTES) c.fail('CORRUPT_RECORD', 'journal file is not a bounded regular file')
    const data = await file.readFile('utf8')
    if (Buffer.byteLength(data) > MAX_BYTES) c.fail('CORRUPT_RECORD', 'journal file grew beyond limit')
    return data
  } finally { await file.close() }
}
function detached(value) {
  try { return structuredClone(value) }
  catch { c.fail('INVALID_RECORD', 'command must contain serializable data only') }
}
async function durableWrite(path, value) {
  const file = await open(path, 'wx', 0o600)
  try { await file.writeFile(value); await file.sync() } finally { await file.close() }
}
async function syncDirectory(path) {
  // Windows does not provide fsync on directory handles. File fsync + same-volume
  // rename covers process crashes; do not claim universal sudden-power-loss durability.
  if (process.platform === 'win32') return
  const file = await open(path, 'r')
  try { await file.sync() } finally { await file.close() }
}
function decoded(data, digest) {
  if (hash(data) !== digest) c.fail('CORRUPT_RECORD', 'journal checksum mismatch')
  const value = JSON.parse(data)
  c.keys(value, ['schemaVersion', 'parentDigest', 'state', 'decision'], 'transaction')
  const state = c.migrate(value)
  c.state(state); c.decision(value.decision)
  if (value.parentDigest !== null) c.text(value.parentDigest, 'parentDigest', 64)
  if (state.stateRevision !== value.decision.actualStateRevision || state.latestDecisionId !== value.decision.id) c.fail('CORRUPT_RECORD', 'state and decision disagree')
  return { state, decision: value.decision, parentDigest: value.parentDigest, schemaVersion: value.schemaVersion, digest }
}
async function readTransaction(directory) {
  if ((await lstat(directory)).isSymbolicLink()) c.fail('CORRUPT_RECORD', 'journal revision must not be a link')
  const manifest = JSON.parse(await boundedRead(join(directory, 'manifest.json')))
  c.keys(manifest, ['sha256'], 'manifest')
  if (typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.sha256)) c.fail('CORRUPT_RECORD', 'invalid journal checksum')
  const copies = await Promise.allSettled(['record.json', 'replica.json'].map(async name => decoded(await boundedRead(join(directory, name)), manifest.sha256)))
  for (const copy of copies) if (copy.status === 'rejected' && copy.reason.code === 'UNSUPPORTED_SCHEMA') throw copy.reason
  const primary = copies[0]
  const replica = copies[1]
  if (primary.status === 'fulfilled') return { ...primary.value, recoveryCode: replica.status === 'fulfilled' ? null : 'REPLICA_DAMAGED' }
  if (replica.status === 'fulfilled') return { ...replica.value, recoveryCode: 'REPLICA_USED' }
  c.fail('CORRUPT_RECORD', 'both transaction copies invalid: ' + primary.reason.message + '; ' + replica.reason.message)
}

/**
 * Trusted Node-only writer; no tool authorization or execution is provided.
 * @param {string} home isolated/actual DSH_HOME selected by the host
 * @param {{beforePublish?: (stage: string) => Promise<void>}} [options] I/O boundary for crash probes
 */
export class ProjectStore {
  constructor(home, options = {}) { this.root = resolve(home, 'governance/projects'); this.beforePublish = options.beforePublish }
  async identity(projectRoot) {
    const canonical = await realpath(projectRoot)
    if (!(await stat(join(canonical, 'project.godot'))).isFile()) c.fail('NOT_GODOT_PROJECT', 'project.godot is required')
    const physical = await stat(canonical, { bigint: true })
    // A different directory recreated at the same path must not inherit prior project facts.
    const projectId = hash(normalized(canonical) + '\0' + physical.dev + ':' + physical.ino + ':' + physical.birthtimeNs)
    return { projectId, projectRoot: canonical, directory: join(this.root, projectId) }
  }
  /** Re-reads disk on every call; stale Agent instances do not own authority. */
  async read(projectRoot) {
    const identity = await this.identity(projectRoot)
    let entries
    try { entries = await readdir(identity.directory) }
    catch (error) { if (error.code === 'ENOENT') return { status: 'NOT_FOUND', state: null, decisions: [], issues: [], digest: null }; throw error }
    if ((await lstat(identity.directory)).isSymbolicLink()) c.fail('CORRUPT_RECORD', 'project state directory must not be a link')
    const revisions = entries.filter(name => /^r-\d{10}$/.test(name)).sort()
    let current = null
    let digest = null
    const decisions = []
    const issues = []
    for (let index = 0; index < revisions.length; index++) {
      const name = revisions[index]
      try {
        if (name !== revisionName(index)) c.fail('CORRUPT_RECORD', 'journal revision gap')
        const record = await readTransaction(join(identity.directory, name))
        if (record.state.projectId !== identity.projectId || normalized(record.state.projectRoot) !== normalized(identity.projectRoot)) c.fail('CORRUPT_RECORD', 'journal belongs to another project')
        if (record.state.stateRevision !== index || record.parentDigest !== digest || record.decision.expectedStateRevision !== (index === 0 ? null : index - 1)) c.fail('CORRUPT_RECORD', 'journal revision chain mismatch')
        if (record.recoveryCode) issues.push({ revision: index, code: record.recoveryCode })
        if (record.schemaVersion === 0) issues.push({ revision: index, code: 'MIGRATED_V0_IN_MEMORY' })
        current = record.state; digest = record.digest; decisions.push(record.decision)
      } catch (error) {
        if (error.code === 'UNSUPPORTED_SCHEMA') throw error
        return { status: 'RECOVERY_REQUIRED', state: current, decisions, digest, issues: [...issues, { revision: index, code: 'CORRUPT_RECORD', message: error.message }] }
      }
    }
    return { status: current ? issues.some(issue => ['REPLICA_USED', 'REPLICA_DAMAGED'].includes(issue.code)) ? 'RECOVERED' : 'READY' : 'NOT_FOUND', state: current, decisions, digest, issues }
  }
  async publish(identity, envelope) {
    c.state(envelope.state); c.decision(envelope.decision)
    await mkdir(identity.directory, { recursive: true })
    if ((await lstat(identity.directory)).isSymbolicLink()) c.fail('CORRUPT_RECORD', 'project state directory must not be a link')
    const data = JSON.stringify(envelope)
    if (Buffer.byteLength(data) > MAX_BYTES) c.fail('INVALID_RECORD', 'project journal transaction exceeds size limit')
    const stage = join(identity.directory, '.pending-' + randomUUID())
    const destination = join(identity.directory, revisionName(envelope.state.stateRevision))
    await mkdir(stage)
    const digest = hash(data)
    let published = false
    try {
      await durableWrite(join(stage, 'record.json'), data)
      await durableWrite(join(stage, 'replica.json'), data)
      await durableWrite(join(stage, 'manifest.json'), JSON.stringify({ sha256: digest }))
      await syncDirectory(stage)
      await this.beforePublish?.(stage)
      try { await rename(stage, destination); published = true }
      catch (error) {
        if (['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(error.code)) {
          try { await stat(destination) } catch { throw error }
          c.fail('CONFLICT', 'another writer committed this revision; reload before retrying')
        }
        throw error
      }
      try { await syncDirectory(identity.directory) }
      catch (error) { c.fail('COMMIT_UNCERTAIN', 'revision published but directory sync failed; read and reconcile before retrying: ' + error.message) }
      return structuredClone(envelope.state)
    } finally {
      // Only our generated staging path is removed; committed history is never overwritten.
      if (!published) await rm(stage, { recursive: true, force: true })
    }
  }
  async create(projectRoot, metadataInput) {
    const metadata = detached(metadataInput)
    c.keys(metadata, ['actor', 'reason'], 'create metadata'); c.actor(metadata.actor); c.text(metadata.reason, 'reason')
    const identity = await this.identity(projectRoot)
    const existing = await this.read(projectRoot)
    if (existing.status !== 'NOT_FOUND') c.fail(existing.status === 'RECOVERY_REQUIRED' ? 'RECOVERY_REQUIRED' : 'ALREADY_EXISTS', 'project already has a journal')
    const id = randomUUID()
    const state = { schemaVersion: 1, projectId: identity.projectId, projectRoot: identity.projectRoot, governanceMode: 'OBSERVED', stateRevision: 0, policyVersion: '1', lifecycle: 'UNASSIGNED', lifecycleProvenance: null, designBaselineRef: null, implementationRevision: { contentFingerprint: null, gitHead: null, godotVersion: null }, currentTask: null, delegation: null, observations: [], latestDecisionId: id }
    return this.publish(identity, { schemaVersion: 1, parentDigest: null, state, decision: { id, operation: 'CREATE_PROJECT', actor: metadata.actor, reason: metadata.reason, expectedStateRevision: null, actualStateRevision: 0, evidenceRefs: [], authorizationRef: null, timestamp: new Date().toISOString() } })
  }
  /** Explicit CAS. Callers must bind an async result to its actual project/revision/run/input. */
  async commit(projectRoot, commandInput) {
    const command = detached(commandInput)
    c.keys(command, ['projectId', 'expectedStateRevision', 'expectedImplementationFingerprint', 'actor', 'reason', 'authorizationRef', 'changes'], 'command')
    c.actor(command.actor); c.text(command.reason, 'reason'); c.natural(command.expectedStateRevision, 'expectedStateRevision')
    c.text(command.projectId, 'projectId')
    if (command.authorizationRef !== undefined && command.authorizationRef !== null) c.text(command.authorizationRef, 'authorizationRef')
    const changes = command.changes
    c.keys(changes, ['currentTask', 'implementationRevision', 'policyVersion', 'designBaselineRef', 'delegation', 'appendObservations', 'adoptPhase'], 'changes')
    if (!Object.keys(changes).length) c.fail('INVALID_RECORD', 'empty changes')
    const identity = await this.identity(projectRoot)
    const loaded = await this.read(projectRoot)
    if (!['READY', 'RECOVERED'].includes(loaded.status)) c.fail(loaded.status, 'cannot write without a fully verified journal')
    const previous = loaded.state
    if (command.projectId !== previous.projectId || command.expectedStateRevision !== previous.stateRevision) c.fail('CONFLICT', 'project or state revision changed')
    if (command.expectedImplementationFingerprint !== undefined && command.expectedImplementationFingerprint !== previous.implementationRevision.contentFingerprint) c.fail('CONFLICT', 'implementation fingerprint changed')
    const next = structuredClone(previous)
    next.stateRevision++; next.latestDecisionId = randomUUID()
    for (const key of ['currentTask', 'implementationRevision', 'policyVersion']) if (Object.hasOwn(changes, key)) next[key] = structuredClone(changes[key])
    if (Object.hasOwn(changes, 'adoptPhase')) {
      if (command.actor.kind !== 'HUMAN' || previous.lifecycle !== 'UNASSIGNED' || !['DISCOVERY', 'BUILD', 'ITERATE', 'OPERATE'].includes(changes.adoptPhase)) c.fail('INVALID_RECORD', 'only explicit human initial adoption is supported in G1b')
      next.lifecycle = changes.adoptPhase
      next.lifecycleProvenance = { kind: 'USER_ADOPTION', decisionId: next.latestDecisionId, historicalEvidence: 'UNVERIFIED' }
    }
    if (Object.hasOwn(changes, 'designBaselineRef')) {
      if (command.actor.kind !== 'HUMAN') c.fail('INVALID_RECORD', 'freezing a design baseline requires a human decision record')
      if (changes.designBaselineRef === null) next.designBaselineRef = null
      else {
        c.keys(changes.designBaselineRef, ['id', 'sourceRef', 'sourceFingerprint'], 'baseline input')
        next.designBaselineRef = { ...changes.designBaselineRef, approvedByDecisionId: next.latestDecisionId }
      }
    }
    if (Object.hasOwn(changes, 'delegation')) {
      c.delegation(changes.delegation, next.projectId)
      if (changes.delegation !== null && changes.delegation.status === 'RECORDED') {
        if (command.actor.kind !== 'HUMAN' || changes.delegation.approvedBy.id !== command.actor.id || changes.delegation.approvedStateRevision !== next.stateRevision || changes.delegation.approvedPolicyVersion !== next.policyVersion || changes.delegation.taskId !== next.currentTask?.id) c.fail('INVALID_RECORD', 'recorded delegation must bind the human, task and committed revision/policy')
      }
      next.delegation = structuredClone(changes.delegation)
    }
    const additions = changes.appendObservations ?? []
    if (!Array.isArray(additions) || additions.length > 100) c.fail('INVALID_RECORD', 'invalid observation batch')
    for (const item of additions) {
      c.observation(item, next.projectId)
      if (command.expectedImplementationFingerprint === undefined || item.taskId !== next.currentTask?.id || item.runId !== next.currentTask?.runId || item.inputFingerprint !== next.implementationRevision.contentFingerprint) c.fail('CONFLICT', 'observation task/run/input no longer matches the project')
      next.observations.push(structuredClone(item))
    }
    c.state(next)
    const decision = { id: next.latestDecisionId, operation: Object.hasOwn(changes, 'adoptPhase') ? 'USER_ADOPTION' : 'UPDATE:' + Object.keys(changes).join(','), actor: structuredClone(command.actor), reason: command.reason, expectedStateRevision: previous.stateRevision, actualStateRevision: next.stateRevision, evidenceRefs: additions.map(item => item.id), authorizationRef: command.authorizationRef ?? null, timestamp: new Date().toISOString() }
    return this.publish(identity, { schemaVersion: 1, parentDigest: loaded.digest, state: next, decision })
  }
}
