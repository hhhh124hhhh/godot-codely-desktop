import type { Context } from '@deepseek-ai/cordis'
import type { WitnessService, WitnessReport } from './witness.mjs'
export type Actor = { kind: 'HUMAN' | 'AGENT' | 'ADAPTER' | 'SYSTEM'; id: string }
export type ImplementationRevision = { contentFingerprint: string | null; gitHead: string | null; godotVersion: string | null }
export type TaskCard = { id: string; runId: string; intent: string; boundary: string; stop: string; stage: 'PROBE' | 'IMPLEMENT' | 'WITNESS' | 'REPAIR' | 'PUBLISH'; progress: string; unverifiedChanges: string[]; stopReason: string | null; recommendedNextAction: string; requiresHuman: string | null }
export type Delegation = { delegationId: string; projectId: string; taskId: string; intent: string; boundary: string; stop: string; allowedActions: string[]; forbiddenActions: string[]; approvedBy: Actor; approvedStateRevision: number; approvedPolicyVersion: string; expiresAt: string; budget: { maxRuns: number; maxToolCalls: number; usedRuns: number; usedToolCalls: number }; status: 'RECORDED' | 'REVOKED' | 'PAUSED' | 'COMPLETED'; triggerMode: 'MANUAL'; triggerStatus: 'NOT_AVAILABLE' }
export type VerificationRecord = { id: string; projectId: string; taskId: string; runId: string; kind: string; provenance: 'ADAPTER_CAPTURED' | 'USER_ATTESTED' | 'AGENT_REPORTED' | 'EXTERNAL_IMPORTED'; outcome: 'PASS' | 'FAIL' | 'UNKNOWN'; inputFingerprint: string; environmentFingerprint: string; assertions: string[]; artifactRefs: string[]; limitations: string[]; observedAt: string }
export type DesignBaselineInput = { id: string; sourceRef: string; sourceFingerprint: string }
export type Lifecycle = 'UNASSIGNED' | 'DISCOVERY' | 'BUILD' | 'ITERATE' | 'OPERATE'
export interface ProjectState {
  schemaVersion: 1
  projectId: string
  projectRoot: string
  governanceMode: 'OBSERVED'
  stateRevision: number
  policyVersion: string
  lifecycle: Lifecycle
  lifecycleProvenance: { kind: 'USER_ADOPTION'; decisionId: string; historicalEvidence: 'UNVERIFIED' } | null
  designBaselineRef: (DesignBaselineInput & { approvedByDecisionId: string }) | null
  implementationRevision: ImplementationRevision
  currentTask: TaskCard | null
  delegation: Delegation | null
  observations: VerificationRecord[]
  latestDecisionId: string
}
export interface DecisionEvent { id: string; operation: string; actor: Actor; reason: string; expectedStateRevision: number | null; actualStateRevision: number; evidenceRefs: string[]; authorizationRef: string | null; timestamp: string }
export interface LoadedProject { status: 'NOT_FOUND' | 'READY' | 'RECOVERED' | 'RECOVERY_REQUIRED'; state: ProjectState | null; decisions: DecisionEvent[]; issues: { revision: number; code: string; message?: string }[]; digest: string | null }
export interface CommitCommand { projectId: string; expectedStateRevision: number; expectedImplementationFingerprint?: string | null; actor: Actor; reason: string; authorizationRef?: string | null; changes: { currentTask?: TaskCard | null; implementationRevision?: ImplementationRevision; policyVersion?: string; designBaselineRef?: DesignBaselineInput | null; delegation?: Delegation | null; appendObservations?: VerificationRecord[]; adoptPhase?: Exclude<Lifecycle, 'UNASSIGNED'> } }
export class GovernanceError extends Error { code: string; constructor(code: string, message: string) }
export class ProjectStore {
  constructor(home: string, options?: { beforePublish?: (stage: string) => Promise<void> })
  identity(projectRoot: string): Promise<{ projectId: string; projectRoot: string; directory: string }>
  read(projectRoot: string): Promise<LoadedProject>
  create(projectRoot: string, metadata: { actor: Actor; reason: string }): Promise<ProjectState>
  commit(projectRoot: string, command: CommitCommand): Promise<ProjectState>
}
export interface ProjectHandoff {
  status: LoadedProject['status']
  projectId: string | null
  executionAuthorized: false
  trigger: 'MANUAL+RESUMABLE'
  basisRevision?: number
  governanceMode?: 'OBSERVED'
  policyVersion?: string
  lifecycle?: Lifecycle
  lifecycleProvenance?: ProjectState['lifecycleProvenance']
  designBaselineRef?: ProjectState['designBaselineRef']
  implementationRevision?: ImplementationRevision
  implementationRevalidated?: false
  verificationValidity?: 'NOT_EVALUATED'
  task?: TaskCard | null
  delegation?: Delegation | null
  authorizationRecordStatus?: string
  verificationRecords?: (VerificationRecord & { inputMatchesRecordedImplementation: boolean; currentTaskRunMatches: boolean })[]
  recentDecisions?: DecisionEvent[]
  issues: LoadedProject['issues']
  stopReason?: string | null
  recommendedNextAction?: string
  verification?: Pick<WitnessReport, 'technicalGate' | 'taskGate' | 'currentInputFingerprint' | 'inspectionError' | 'issues'>
}
export function projectHandoff(loaded: LoadedProject, now?: number): ProjectHandoff
export function registerProjectHandoff(ctx: Context, store: ProjectStore, witness?: WitnessService): () => void
export function createProjectStore(home: string): ProjectStore
