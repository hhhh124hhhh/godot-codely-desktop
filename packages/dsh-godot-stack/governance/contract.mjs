/** Serializable G1b records. These facts never authorize or schedule tool execution. */
export const SCHEMA_VERSION = 1
export const LIFECYCLES = ['UNASSIGNED', 'DISCOVERY', 'BUILD', 'ITERATE', 'OPERATE']
export class GovernanceError extends Error {
  constructor(code, message) { super(message); this.name = 'GovernanceError'; this.code = code }
}
export const fail = (code, message) => { throw new GovernanceError(code, message) }
export function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('INVALID_RECORD', label + ' must be a plain object')
  return value
}
export function keys(value, allowed, label) {
  object(value, label)
  if (Object.keys(value).some(key => !allowed.includes(key))) fail('INVALID_RECORD', label + ' contains unknown fields')
}
export function text(value, label, max = 4096) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('INVALID_RECORD', label + ' must be nonempty bounded text')
  return value
}
export function strings(value, label) {
  if (!Array.isArray(value) || value.length > 200) fail('INVALID_RECORD', label + ' must be a bounded array')
  for (const item of value) text(item, label)
}
export function natural(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail('INVALID_RECORD', label + ' must be a nonnegative integer')
}
export function oneOf(value, values, label) {
  if (!values.includes(value)) fail('INVALID_RECORD', 'invalid ' + label)
}
export function timestamp(value, label) {
  text(value, label)
  if (!Number.isFinite(Date.parse(value))) fail('INVALID_RECORD', 'invalid ' + label)
}
export function actor(value) {
  keys(value, ['kind', 'id'], 'actor')
  oneOf(value.kind, ['HUMAN', 'AGENT', 'ADAPTER', 'SYSTEM'], 'actor.kind')
  text(value.id, 'actor.id', 200)
}
export function implementation(value) {
  keys(value, ['contentFingerprint', 'gitHead', 'godotVersion'], 'implementationRevision')
  for (const key of ['contentFingerprint', 'gitHead', 'godotVersion']) if (value[key] !== null) text(value[key], key, 300)
}
export function task(value) {
  if (value === null) return
  keys(value, ['id', 'runId', 'intent', 'boundary', 'stop', 'stage', 'progress', 'unverifiedChanges', 'stopReason', 'recommendedNextAction', 'requiresHuman'], 'currentTask')
  for (const key of ['id', 'runId', 'intent', 'boundary', 'stop', 'progress', 'recommendedNextAction']) text(value[key], 'task.' + key)
  oneOf(value.stage, ['PROBE', 'IMPLEMENT', 'WITNESS', 'REPAIR', 'PUBLISH'], 'task.stage')
  strings(value.unverifiedChanges, 'task.unverifiedChanges')
  if (value.stopReason !== null) text(value.stopReason, 'task.stopReason')
  if (value.requiresHuman !== null) text(value.requiresHuman, 'task.requiresHuman')
}
export function delegation(value, projectId) {
  if (value === null) return
  keys(value, ['delegationId', 'projectId', 'taskId', 'intent', 'boundary', 'stop', 'allowedActions', 'forbiddenActions', 'approvedBy', 'approvedStateRevision', 'approvedPolicyVersion', 'expiresAt', 'budget', 'status', 'triggerMode', 'triggerStatus'], 'delegation')
  for (const key of ['delegationId', 'taskId', 'intent', 'boundary', 'stop', 'approvedPolicyVersion']) text(value[key], 'delegation.' + key)
  if (value.projectId !== projectId) fail('CONFLICT', 'delegation project mismatch')
  actor(value.approvedBy)
  if (value.approvedBy.kind !== 'HUMAN') fail('INVALID_RECORD', 'delegation requires a named human record')
  natural(value.approvedStateRevision, 'approvedStateRevision')
  timestamp(value.expiresAt, 'expiresAt')
  strings(value.allowedActions, 'allowedActions'); strings(value.forbiddenActions, 'forbiddenActions')
  keys(value.budget, ['maxRuns', 'maxToolCalls', 'usedRuns', 'usedToolCalls'], 'budget')
  for (const key of ['maxRuns', 'maxToolCalls', 'usedRuns', 'usedToolCalls']) natural(value.budget[key], 'budget.' + key)
  oneOf(value.status, ['RECORDED', 'REVOKED', 'PAUSED', 'COMPLETED'], 'delegation.status')
  if (value.triggerMode !== 'MANUAL' || value.triggerStatus !== 'NOT_AVAILABLE') fail('INVALID_RECORD', 'G1b supports manual resumable records only')
}
export function observation(value, projectId) {
  keys(value, ['id', 'projectId', 'taskId', 'runId', 'kind', 'provenance', 'outcome', 'inputFingerprint', 'environmentFingerprint', 'assertions', 'artifactRefs', 'limitations', 'observedAt'], 'observation')
  for (const key of ['id', 'taskId', 'runId', 'kind', 'inputFingerprint', 'environmentFingerprint']) text(value[key], 'observation.' + key)
  if (value.projectId !== projectId) fail('CONFLICT', 'observation project mismatch')
  oneOf(value.provenance, ['ADAPTER_CAPTURED', 'USER_ATTESTED', 'AGENT_REPORTED', 'EXTERNAL_IMPORTED'], 'provenance')
  oneOf(value.outcome, ['PASS', 'FAIL', 'UNKNOWN'], 'outcome')
  for (const key of ['assertions', 'artifactRefs', 'limitations']) strings(value[key], 'observation.' + key)
  timestamp(value.observedAt, 'observedAt')
}
export function state(value) {
  keys(value, ['schemaVersion', 'projectId', 'projectRoot', 'governanceMode', 'stateRevision', 'policyVersion', 'lifecycle', 'lifecycleProvenance', 'designBaselineRef', 'implementationRevision', 'currentTask', 'delegation', 'observations', 'latestDecisionId'], 'state')
  if (value.schemaVersion !== SCHEMA_VERSION) fail('UNSUPPORTED_SCHEMA', 'unsupported state schema')
  text(value.projectId, 'projectId', 100); text(value.projectRoot, 'projectRoot')
  if (value.governanceMode !== 'OBSERVED') fail('INVALID_RECORD', 'G1b must remain OBSERVED')
  natural(value.stateRevision, 'stateRevision'); text(value.policyVersion, 'policyVersion', 200)
  oneOf(value.lifecycle, LIFECYCLES, 'lifecycle')
  if (value.lifecycleProvenance !== null) {
    keys(value.lifecycleProvenance, ['kind', 'decisionId', 'historicalEvidence'], 'lifecycleProvenance')
    if (value.lifecycleProvenance.kind !== 'USER_ADOPTION' || value.lifecycleProvenance.historicalEvidence !== 'UNVERIFIED') fail('INVALID_RECORD', 'adoption cannot invent historical Gate results')
    text(value.lifecycleProvenance.decisionId, 'adoption.decisionId')
  }
  if (value.lifecycle === 'UNASSIGNED' ? value.lifecycleProvenance !== null : value.lifecycleProvenance === null) fail('INVALID_RECORD', 'lifecycle requires adoption provenance')
  if (value.designBaselineRef !== null) {
    keys(value.designBaselineRef, ['id', 'sourceRef', 'sourceFingerprint', 'approvedByDecisionId'], 'designBaselineRef')
    for (const key of ['id', 'sourceRef', 'sourceFingerprint', 'approvedByDecisionId']) text(value.designBaselineRef[key], 'baseline.' + key)
  }
  implementation(value.implementationRevision); task(value.currentTask); delegation(value.delegation, value.projectId)
  if (!Array.isArray(value.observations) || value.observations.length > 1000) fail('INVALID_RECORD', 'too many observations')
  const ids = new Set()
  for (const item of value.observations) {
    observation(item, value.projectId)
    if (ids.has(item.id)) fail('INVALID_RECORD', 'duplicate observation id')
    ids.add(item.id)
  }
  text(value.latestDecisionId, 'latestDecisionId')
}
export function decision(value) {
  keys(value, ['id', 'operation', 'actor', 'reason', 'expectedStateRevision', 'actualStateRevision', 'evidenceRefs', 'authorizationRef', 'timestamp'], 'decision')
  for (const key of ['id', 'operation', 'reason']) text(value[key], 'decision.' + key)
  actor(value.actor); natural(value.actualStateRevision, 'actualStateRevision')
  if (value.expectedStateRevision !== null) natural(value.expectedStateRevision, 'expectedStateRevision')
  strings(value.evidenceRefs, 'decision.evidenceRefs')
  if (value.authorizationRef !== null) text(value.authorizationRef, 'authorizationRef')
  timestamp(value.timestamp, 'decision.timestamp')
}
/** v0 is an explicit import format, never an existing shipped product state. */
export function migrate(envelope) {
  if (envelope.schemaVersion !== 0 && envelope.schemaVersion !== 1) fail('UNSUPPORTED_SCHEMA', 'journal schema is newer or unknown')
  if (envelope.schemaVersion === 1) return envelope.state
  object(envelope.state, 'v0 state')
  if (['schemaVersion', 'governanceMode', 'delegation'].some(key => Object.hasOwn(envelope.state, key))) fail('UNSUPPORTED_SCHEMA', 'unrecognized v0 fields; refusing to discard recorded facts')
  return { ...envelope.state, schemaVersion: 1, governanceMode: 'OBSERVED', delegation: null }
}
