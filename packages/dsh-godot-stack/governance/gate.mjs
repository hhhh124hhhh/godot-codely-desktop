/** Named, versioned gates. A technical PASS never closes the task or proves gameplay/device UX. */
export const HEADLESS_POLICY = Object.freeze({
  gateId: 'GODOT-COMPILE-SMOKE', gateKind: 'TASK', policyVersion: '1',
  requirements: [{ id: 'headless', kind: 'godot_headless', collector: 'godot-project-verify/v1', provenance: 'ADAPTER_CAPTURED', assertions: ['godot.verify'], target: 'headless' }],
  humanCheckpointRule: null,
})
export const TASK_REVIEW_POLICY = Object.freeze({
  ...HEADLESS_POLICY, gateId: 'GODOT-TASK-REVIEW',
  humanCheckpointRule: { question: 'Has a human played the current build and confirmed that the core gameplay is fun?', negativeVerdict: 'REPAIR' },
})

/** Pure replayable evaluation. Evidence is supplied by trusted Node collectors, never model text.
 * @param {object} policy versioned requirements and human checkpoint rule
 * @param {object} context current project/task/run/input/environment and verified journal status
 * @param {Array<object>} evidence separate immutable observations, including their provenance
 * @param {Array<object>} attestations explicit human answers, independently bound to scope/revision
 */
export function evaluateGate(policy, context, evidence, attestations = []) {
  const base = { gateId: policy.gateId, gateKind: policy.gateKind, policyVersion: policy.policyVersion, evaluatedStateRevision: context.stateRevision, reasons: [], missingRequirements: [], blockingEvidenceRefs: [] }
  const verdict = (value, reason, missing = [], blocking = []) => ({ ...base, verdict: value, reasons: [reason], missingRequirements: missing, blockingEvidenceRefs: blocking })
  if (!['READY', 'RECOVERED'].includes(context.status) || !context.projectId || !context.taskId || !context.runId || !context.inputFingerprint || !context.environmentFingerprint || context.inputStable === false) return verdict('UNKNOWN', 'CURRENT_INPUT_OR_JOURNAL_UNCONFIRMED')
  if (context.stopRule) return verdict('STOP', 'STOP_RULE:' + context.stopRule)
  if (context.unresolved) return verdict('UNKNOWN', 'RECONCILE_UNKNOWN_RESULT_BEFORE_RETRY', [], [context.unresolved])
  const missing = []
  const current = []
  for (const requirement of policy.requirements) {
    const relevant = evidence.filter(item => item.projectId === context.projectId && item.taskId === context.taskId && item.runId === context.runId && item.kind === requirement.kind && item.provenance === requirement.provenance && item.collector === requirement.collector && item.target === requirement.target && item.inputFingerprint === context.inputFingerprint && item.environmentFingerprint === context.environmentFingerprint)
    const latest = relevant.at(-1)
    if (!latest || latest.runState !== 'DONE') { missing.push(requirement.id); continue }
    current.push(latest)
    if (!['PASS', 'FAIL', 'UNKNOWN'].includes(latest.outcome)) return verdict('UNKNOWN', 'INVALID_EVIDENCE_OUTCOME', [], [latest.id])
    if (latest.outcome === 'PASS' && !requirement.assertions.every(value => latest.assertions.includes(value))) missing.push(requirement.id)
  }
  const unknown = current.filter(item => item.outcome === 'UNKNOWN')
  if (unknown.length) return verdict('UNKNOWN', 'RECONCILE_UNKNOWN_RESULT_BEFORE_RETRY', [], unknown.map(item => item.id))
  const failed = current.filter(item => item.outcome === 'FAIL')
  if (failed.length) return verdict('REPAIR', 'CURRENT_REQUIRED_EVIDENCE_FAILED', [], failed.map(item => item.id))
  if (missing.length) return verdict('WAIT_EVIDENCE', 'MISSING_STALE_OR_UNTRUSTED_EVIDENCE', missing)
  if (policy.humanCheckpointRule) {
    const rule = policy.humanCheckpointRule
    const answer = attestations.filter(item => item.actor?.kind === 'HUMAN' && item.actor.id && item.question === rule.question && item.projectId === context.projectId && item.taskId === context.taskId && item.runId === context.runId && item.approvedRevision === context.stateRevision && item.inputFingerprint === context.inputFingerprint && item.policyVersion === policy.policyVersion && item.gateId === policy.gateId && item.approvedScope === context.scope).at(-1)
    if (!answer) return verdict('WAIT_HUMAN', 'CURRENT_SCOPE_REQUIRES_HUMAN_ANSWER')
    if (['NO', 'NEEDS_CHANGE'].includes(answer.answer)) return verdict(rule.negativeVerdict, 'HUMAN_CHECKPOINT_REJECTED')
    if (answer.answer !== 'YES') return verdict('UNKNOWN', 'INVALID_HUMAN_ANSWER')
  }
  return verdict('PASS', 'NAMED_GATE_REQUIREMENTS_SATISFIED')
}
