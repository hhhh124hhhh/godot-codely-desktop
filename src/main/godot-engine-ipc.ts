import type { GodotEngineResult, GodotEngineAction } from '../shared/godot-engine'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { GodotEngineService, engineError, type GodotEngineProject } from './godot-engine'
import { mainLog } from './main-log'

interface EngineRequest { action: GodotEngineAction; workspaceId?: string }
const ACTIONS = new Set(['status', 'choose', 'open', 'run', 'stop'])

/** The same handler is exercised with real Electron windows in native acceptance. */
export function createGodotEngineHandler(options: {
  service: GodotEngineService
  window: () => BrowserWindow | undefined
  endpoint: () => string | undefined
  pickExecutable: () => Promise<string | null>
}): (event: IpcMainInvokeEvent, value: unknown) => Promise<GodotEngineResult> {
  return async (event, value) => {
    const window = options.window()
    const endpoint = options.endpoint()
    if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return { ok: false, code: 'ENGINE_UNAVAILABLE' }
    try {
      if (!endpoint || new URL(event.senderFrame.url).origin !== new URL(endpoint).origin) return { ok: false, code: 'ENGINE_UNAVAILABLE' }
    } catch { return { ok: false, code: 'ENGINE_UNAVAILABLE' } }
    return handleGodotEngineRequest(options.service, value, async workspaceId => {
      const url = new URL('/api/godot-desktop/project', endpoint)
      url.searchParams.set('workspaceId', workspaceId)
      const response = await event.sender.session.fetch(url.href, { credentials: 'include', signal: AbortSignal.timeout(10_000) })
      const project: unknown = await response.json()
      if (!response.ok) throw engineError('WORKSPACE_MISSING')
      if (!project || typeof project !== 'object' || !('godot' in project) || project.godot !== true || !('workspaceId' in project) || project.workspaceId !== workspaceId || !('path' in project) || typeof project.path !== 'string' || !('mainScene' in project) || typeof project.mainScene !== 'string') throw engineError('NOT_GODOT_PROJECT')
      return { path: project.path, mainScene: project.mainScene }
    }, options.pickExecutable)
  }
}

function parseRequest(value: unknown): EngineRequest {
  if (!value || typeof value !== 'object' || !('action' in value) || typeof value.action !== 'string' || !ACTIONS.has(value.action)) throw engineError('INVALID_ACTION')
  const workspaceId = 'workspaceId' in value ? value.workspaceId : undefined
  if (workspaceId !== undefined && (typeof workspaceId !== 'string' || !workspaceId || workspaceId.length > 200)) throw engineError('WORKSPACE_REQUIRED')
  if ('path' in value || 'pid' in value || 'args' in value) throw engineError('INVALID_ACTION')
  return { action: value.action as GodotEngineAction, ...(typeof workspaceId === 'string' ? { workspaceId } : {}) }
}

/** Caller must first authenticate the window, main frame, active origin and normal Profile. */
export async function handleGodotEngineRequest(
  service: Pick<GodotEngineService, 'configure' | 'snapshot' | 'launch' | 'stop'>,
  value: unknown,
  resolveProject: (id: string) => Promise<GodotEngineProject>,
  pickExecutable: () => Promise<string | null>
): Promise<GodotEngineResult> {
  try {
    const request = parseRequest(value)
    if (request.action === 'choose') {
      const path = await pickExecutable()
      if (path) await service.configure(path)
      return { ok: true, state: await service.snapshot() }
    }
    if (!request.workspaceId && request.action !== 'status') throw engineError('WORKSPACE_REQUIRED')
    const project = request.workspaceId ? await resolveProject(request.workspaceId) : undefined
    if (request.action === 'open' || request.action === 'run') {
      if (!project) throw engineError('WORKSPACE_REQUIRED')
      await service.launch(project, request.action)
    } else if (request.action === 'stop') {
      if (!project) throw engineError('WORKSPACE_REQUIRED')
      await service.stop(project)
    }
    return { ok: true, state: await service.snapshot(project) }
  } catch (error) {
    const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'ENGINE_REQUEST_FAILED'
    const publicCodes = new Set(['INVALID_ACTION', 'WORKSPACE_REQUIRED', 'WORKSPACE_MISSING', 'NOT_GODOT_PROJECT', 'ENGINE_BUSY', 'ENGINE_INVALID', 'ENGINE_VERSION', 'ENGINE_MISSING', 'NO_MAIN_SCENE', 'ENGINE_ALREADY_RUNNING', 'ENGINE_START_FAILED', 'ENGINE_STOP_FAILED', 'ENGINE_STOP_TIMEOUT'])
    mainLog('warn', '[godot-engine] action failed', error)
    return { ok: false, code: publicCodes.has(code) ? code : 'ENGINE_REQUEST_FAILED' }
  }
}
