import { projectHandoff } from './governance/handoff.mjs'
import { open, realpath } from 'node:fs/promises'
import { join, basename } from 'node:path'

const failure = (code, status = 400) => Object.assign(new Error(code), { code, status })
const publicCodes = new Set(['ORIGIN_REJECTED', 'WORKSPACE_REQUIRED', 'WORKSPACE_MISSING', 'NOT_GODOT_PROJECT', 'PROJECT_TOO_LARGE', 'INVALID_ACTION'])

/** Read only a registered workspace root. Never accept a renderer-supplied file path. */
export async function inspectProject(workspace) {
  const path = await realpath(workspace.path)
  let file
  try { file = await open(join(path, 'project.godot'), 'r') }
  catch (error) {
    if (error.code === 'ENOENT') return { workspaceId: workspace.id, path, name: workspace.title || basename(path), godot: false }
    throw error
  }
  let text
  try {
    if ((await file.stat()).size > 1024 * 1024) throw failure('PROJECT_TOO_LARGE')
    text = await file.readFile('utf8')
  } finally { await file.close() }
  // Read metadata only; Godot remains responsible for interpreting project settings.
  const setting = key => {
    const line = text.split(/\r?\n/).find(value => value.startsWith(key + '='))
    if (!line) return ''
    try { const value = JSON.parse(line.slice(key.length + 1)); return typeof value === 'string' ? value : '' }
    catch { return '' }
  }
  return { workspaceId: workspace.id, path, godot: true, name: setting('config/name') || workspace.title || basename(path), mainScene: setting('run/main_scene') }
}

/** Same-origin, authenticated Harness routes; the editor bridge is never exposed through CORS. */
export function registerDesktopApi(ctx, bridge, projectStore) {
  const register = (path, methods, handler) => ctx.connection.fetch.register({
    path: '/api/godot-desktop/' + path, methods, requestBody: 'buffered',
    async fetch(request) {
      try {
        const origin = request.headers.get('origin')
        // The pinned Connection carrier uses http://dsh.internal as Request.url.
        // The original Host header, not that synthetic origin, identifies the browser endpoint.
        if (request.method !== 'GET' && origin && new URL(origin).host !== (request.headers.get('host') || new URL(request.url).host)) throw failure('ORIGIN_REJECTED', 403)
        const id = new URL(request.url).searchParams.get('workspaceId')
        if (!id || id.length > 200) throw failure('WORKSPACE_REQUIRED')
        const workspace = ctx.workspaceRegistry.get(id)
        if (!workspace) throw failure('WORKSPACE_MISSING', 404)
        const project = await inspectProject(workspace)
        if (path !== 'project' && !project.godot) throw failure('NOT_GODOT_PROJECT', 409)
        return Response.json(await handler(request, project), { headers: { 'cache-control': 'no-store' } })
      } catch (error) {
        ctx.logger?.warn?.('godot-desktop %s: %s', path, error.message)
        return Response.json({ code: publicCodes.has(error.code) ? error.code : error.status === 503 ? 'EDITOR_OFFLINE' : error.status === 504 ? 'EDITOR_TIMEOUT' : error.status === 409 ? 'EDITOR_BUSY' : 'REQUEST_FAILED' }, { status: error.status || 500, headers: { 'cache-control': 'no-store' } })
      }
    }
  })
  if (projectStore) register('handoff', ['GET'], async (_request, project) => projectHandoff(await projectStore.read(project.path)))
  register('project', ['GET'], async (_request, project) => project)
  register('session', ['POST'], async (_request, project) => {
    const created = await bridge.client.createSession({ workspaceId: project.workspaceId, preset: 'godot-codely-lite' })
    return { sessionId: created.sessionId }
  })
  register('editor', ['POST'], async (request, project) => {
    if (Number(request.headers.get('content-length')) > 1024) throw failure('INVALID_ACTION')
    let body
    try { body = await request.json() } catch { throw failure('INVALID_ACTION') }
    if (!['status', 'scan', 'play', 'stop'].includes(body?.action)) throw failure('INVALID_ACTION')
    return bridge.editorControl.execute({ projectPath: project.path, action: body.action })
  })
}
