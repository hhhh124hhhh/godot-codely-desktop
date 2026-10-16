/** Native desktop engine controls. Paths and PIDs are never accepted from the renderer. */
export interface GodotEngineState {
  path: string | null
  version: string | null
  running: boolean
  editorRunning: boolean
  exitCode: number | null
  logs: string
  truncated: boolean
}

export type GodotEngineResult = { ok: true; state: GodotEngineState } | { ok: false; code: string }
export type GodotEngineAction = 'status' | 'choose' | 'open' | 'run' | 'stop'

export interface GodotEngineBridge {
  status(workspaceId?: string): Promise<GodotEngineResult>
  choose(): Promise<GodotEngineResult>
  open(workspaceId: string): Promise<GodotEngineResult>
  run(workspaceId: string): Promise<GodotEngineResult>
  stop(workspaceId: string): Promise<GodotEngineResult>
}
