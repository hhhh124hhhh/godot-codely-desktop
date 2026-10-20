Warning: fs was declared with const; use let for reassignable variables.
export type GateVerdict = 'PASS' | 'WAIT_EVIDENCE' | 'WAIT_HUMAN' | 'REPAIR' | 'STOP' | 'UNKNOWN'
export interface GatePolicy {
  gateId: string
  gateKind: 'TASK' | 'LIFECYCLE'
  policyVersion: string
  requirements: { id: string; kind: string; collector: string; provenance: string; assertions: string[]; target: string }[]
  humanCheckpointRule: { question: string; negativeVerdict: 'STOP' | 'REPAIR' } | null
}
export interface GateContext {
  status: string
  projectId?: string
  taskId?: string
  runId?: string
  stateRevision?: number
  scope?: string
  inputFingerprint?: string
  environmentFingerprint?: string
  inputStable?: boolean
  stopRule?: string
  unresolved?: string | null
}
export interface GateEvidence {
  id: string
  projectId: string
  taskId: string
  runId: string
  kind: string
  collector: string
  provenance: string
  target: string
  inputFingerprint: string
  environmentFingerprint: string
  runState: 'NOT_RUN' | 'RUNNING' | 'DONE'
  outcome: 'PASS' | 'FAIL' | 'UNKNOWN'
  assertions: string[]
}
export interface HumanAttestation {
  actor: { kind: 'HUMAN'; id: string }
  question: string
  answer: 'YES' | 'NO' | 'NEEDS_CHANGE'
  projectId: string
  taskId: string
  runId: string
  approvedRevision: number
  inputFingerprint: string
  policyVersion: string
  gateId: string
  approvedScope: string
}
export interface GateResult {
  gateId: string
  gateKind: GatePolicy['gateKind']
  policyVersion: string
  evaluatedStateRevision: number | undefined
  verdict: GateVerdict
  reasons: string[]
  missingRequirements: string[]
  blockingEvidenceRefs: string[]
}
export const HEADLESS_POLICY: Readonly<GatePolicy>
export const TASK_REVIEW_POLICY: Readonly<GatePolicy>
export function evaluateGate(policy: GatePolicy, context: GateContext, evidence: GateEvidence[], attestations?: HumanAttestation[]): GateResult
