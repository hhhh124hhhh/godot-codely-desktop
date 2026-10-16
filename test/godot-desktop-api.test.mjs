import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { inspectProject, registerDesktopApi } from '../packages/dsh-godot-stack/desktop-api.mjs'
import { EditorControl } from '../packages/dsh-godot-stack/bridge/editor-control.mjs'

const roots = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const path = await mkdtemp(join(tmpdir(), 'godot-desktop-')); roots.push(path)
  const workspace = { id: 'game', title: 'Folder', path }
  const routes = new Map()
  const bridge = { client: { createSession: vi.fn(async () => ({ sessionId: 'native-session' })) }, editorControl: new EditorControl({ timeoutMs: 1000 }) }
  const ctx = { connection: { fetch: { register: route => routes.set(route.path, route) } }, workspaceRegistry: { get: id => id === workspace.id ? workspace : undefined }, logger: { warn() {} } }
  registerDesktopApi(ctx, bridge)
  const request = (endpoint, body, id = 'game', origin) => routes.get('/api/godot-desktop/' + endpoint).fetch(new Request('http://localhost/api/godot-desktop/' + endpoint + '?workspaceId=' + id, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(origin ? { origin } : {}) }, body: body ? JSON.stringify(body) : undefined }))
  return { path, workspace, bridge, request }
}
const config = 'config_version=5\n[application]\nconfig/name="星岛漫游"\nrun/main_scene="res://main.tscn"\n'
it('reads real project metadata without treating an ordinary folder as a game', async () => {
  const f = await fixture()
  expect(await inspectProject(f.workspace)).toMatchObject({ godot: false, name: 'Folder' })
  await writeFile(join(f.path, 'project.godot'), config)
  expect(await inspectProject(f.workspace)).toMatchObject({ godot: true, name: '星岛漫游', mainScene: 'res://main.tscn' })
})
it('creates a native Lite session only for a registered Godot project', async () => {
  const f = await fixture()
  expect((await f.request('session', {})).status).toBe(409)
  expect((await f.request('session', {}, 'unknown')).status).toBe(404)
  await writeFile(join(f.path, 'project.godot'), config)
  expect(await (await f.request('session', {})).json()).toEqual({ sessionId: 'native-session' })
  expect(f.bridge.client.createSession).toHaveBeenCalledWith({ workspaceId: 'game', preset: 'godot-codely-lite' })
  expect(f.bridge.client.createSession).toHaveBeenCalledTimes(1)
  expect((await f.request('session', {}, 'game', 'https://foreign.example')).status).toBe(403)
})
it('accepts the original browser Host when Harness supplies a synthetic request URL', async () => {
  const f = await fixture()
  await writeFile(join(f.path, 'project.godot'), config)
  const routes = []
  registerDesktopApi({ connection: { fetch: { register: route => routes.push(route) } }, workspaceRegistry: { get: () => f.workspace } }, f.bridge)
  const response = await routes.find(route => route.path.endsWith('/session')).fetch(new Request('http://dsh.internal/api/godot-desktop/session?workspaceId=game', { method: 'POST', headers: { origin: 'http://127.0.0.1:43129', host: '127.0.0.1:43129' } }))
  expect(response.status).toBe(200)
})
it('dispatches editor actions to the selected project and preserves offline and timeout outcomes', async () => {
  const f = await fixture()
  await writeFile(join(f.path, 'project.godot'), config)
  expect(await (await f.request('editor', { action: 'play' })).json()).toEqual({ code: 'EDITOR_OFFLINE' })
  const heartbeat = { projectPath: f.path, editorId: 'editor' }
  f.bridge.editorControl.poll(heartbeat)
  const pending = f.request('editor', { action: 'status', projectPath: 'ignored-path' })
  await vi.waitFor(() => expect(f.bridge.editorControl.pending.size).toBe(1))
  const [command] = f.bridge.editorControl.poll(heartbeat)
  f.bridge.editorControl.poll({ ...heartbeat, results: [{ id: command.id, result: { ok: true, playing: false } }] })
  expect(await (await pending).json()).toEqual({ ok: true, playing: false })
  f.bridge.editorControl.timeoutMs = 30
  expect(await (await f.request('editor', { action: 'play' })).json()).toEqual({ code: 'EDITOR_TIMEOUT' })
  expect(f.bridge.editorControl.poll(heartbeat)).toEqual([])
  expect((await f.request('editor', { action: 'shell' })).status).toBe(400)
  f.bridge.editorControl.stop()
})
