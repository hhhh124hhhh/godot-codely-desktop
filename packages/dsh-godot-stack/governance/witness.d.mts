import type { ProjectStore } from './index.mjs'
import type { GateResult } from './gate.mjs'
export interface WitnessReport {
  governanceMode: 'OBSERVED'
  executionAuthorized: false
  trigger: 'MANUAL+RESUMABLE'
  projectId: string | null
  basisRevision: number | null
  currentInputFingerprint: string | null
  environment: { collector: string; collectorDigest: string; godotVersion: string; executable: string; platform: string; arch: string; node: string; frames: number } | null
  technicalGate: GateResult
  taskGate: GateResult
  inspectionError: string | null
  latestValidation: unknown
  evidence: { id: string; kind: string; outcome: 'PASS' | 'FAIL' | 'UNKNOWN'; runState: 'RUNNING' | 'DONE'; provenance: string; target: string; runId: string; artifactRefs: string[]; validity: 'CURRENT' | 'STALE'; startedAt: string; completedAt: string | null; limitations: string[] }[]
  issues: { code: string; message?: string; evidenceId?: string; revision?: number }[]
}
export interface WitnessService {
  report(root: string): Promise<WitnessReport>
  run(root: string, input: unknown): Promise<WitnessReport>
  dispose(): void
}
export function createWitnessService(store: ProjectStore, home: string): WitnessService
