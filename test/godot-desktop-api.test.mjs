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

it('serves persisted handoffs only for registered Godot workspaces, without adding a write route', async () => {
  const { ProjectStore } = await import('../packages/dsh-godot-stack/governance/index.mjs')
  const f = await fixture()
  await writeFile(join(f.path, 'project.godot'), config)
  const store = new ProjectStore(join(f.path, 'isolated-home'))
  const state = await store.create(f.path, { actor: { kind: 'HUMAN', id: 'test-owner' }, reason: 'Read-only handoff endpoint test' })
  const routes = new Map()
  const ctx = { connection: { fetch: { register: route => routes.set(route.path, route) } }, workspaceRegistry: { get: id => id === 'game' ? f.workspace : undefined }, logger: { warn() {} } }
  registerDesktopApi(ctx, f.bridge, store)
  const route = routes.get('/api/godot-desktop/handoff')
  expect(route.methods).toEqual(['GET'])
  const response = await route.fetch(new Request('http://localhost/api/godot-desktop/handoff?workspaceId=game'))
  expect(await response.json()).toMatchObject({ projectId: state.projectId, basisRevision: 0, governanceMode: 'OBSERVED', executionAuthorized: false })
  expect((await route.fetch(new Request('http://localhost/api/godot-desktop/handoff?workspaceId=unknown'))).status).toBe(404)
  expect((await store.read(f.path)).state.stateRevision).toBe(0)
})

it('records user tasks through a bounded same-origin route, preserves CAS and restores after reopening', async () => {
  const { ProjectStore } = await import('../packages/dsh-godot-stack/governance/index.mjs')
  const f = await fixture()
  await writeFile(join(f.path, 'project.godot'), config)
  const home = join(f.path, 'record-home')
  const store = new ProjectStore(home)
  const routes = new Map()
  registerDesktopApi({ connection: { fetch: { register: route => routes.set(route.path, route) } }, workspaceRegistry: { get: id => id === 'game' ? f.workspace : undefined } }, f.bridge, store)
  const post = (body, origin = 'http://localhost', id = 'game') => routes.get('/api/godot-desktop/record').fetch(new Request('http://localhost/api/godot-desktop/record?workspaceId=' + id, { method: 'POST', headers: origin ? { origin } : {}, body: JSON.stringify(body) }))
  const create = { action: 'create', actorName: 'Fixture owner', expectedStateRevision: null }
  expect((await post(create, '')).status).toBe(403)
  expect((await post(create, 'https://foreign.example')).status).toBe(403)
  expect((await post(create, 'http://localhost', 'unknown')).status).toBe(404)
  expect((await store.read(f.path)).status).toBe('NOT_FOUND')
  const initial = await (await post(create)).json()
  expect(initial).toMatchObject({ status: 'READY', basisRevision: 0, executionAuthorized: false })
  expect((await post(create)).status).toBe(409)
  const task = { intent: 'Fix jump', boundary: 'Player script only', stop: 'Stop if scene changes are needed', progress: 'Not started', recommendedNextAction: 'Inspect player script' }
  const update = { action: 'task', actorName: 'Fixture owner', projectId: initial.projectId, expectedStateRevision: 0, task }
  expect((await post({ ...update, projectId: 'different-project' })).status).toBe(409)
  expect((await post({ ...update, delegation: {} })).status).toBe(400)
  expect((await post({ ...update, task: { ...task, intent: '' } })).status).toBe(400)
  expect((await post({ ...update, actorName: 'x'.repeat(33000) })).status).toBe(400)
  const saved = await (await post(update)).json()
  expect(saved).toMatchObject({ basisRevision: 1, task, executionAuthorized: false, verificationRecords: [] })
  expect((await post(update)).status).toBe(409)
  const reopened = await new ProjectStore(home).read(f.path)
  expect(reopened.state.currentTask).toMatchObject(task)
  expect(reopened.decisions.at(-1).actor).toEqual({ kind: 'HUMAN', id: 'Fixture owner' })
  const changed = await (await post({ ...update, expectedStateRevision: 1, task: { ...task, boundary: 'Player and input scripts' } })).json()
  expect(changed.task.runId).not.toBe(saved.task.runId)
  const identity = await store.identity(f.path)
  for (const file of ['record.json', 'replica.json']) await writeFile(join(identity.directory, 'r-0000000002', file), 'damaged')
  expect((await post({ ...update, expectedStateRevision: 2 })).status).toBe(409)
  expect(await (await post({ ...update, expectedStateRevision: 2 })).json()).toEqual({ code: 'RECOVERY_REQUIRED' })
})

it('binds WITNESS to a registered workspace and rejects foreign or missing origins before execution', async () => {
  const f = await fixture()
  await writeFile(join(f.path, 'project.godot'), config)
  const routes = new Map()
  const witness = { report: vi.fn(async () => ({ technicalGate: { verdict: 'WAIT_EVIDENCE' } })), run: vi.fn(async () => ({ taskGate: { verdict: 'WAIT_HUMAN' } })) }
  registerDesktopApi({ connection: { fetch: { register: route => routes.set(route.path, route) } }, workspaceRegistry: { get: id => id === 'game' ? f.workspace : undefined } }, f.bridge, {}, witness)
  const route = routes.get('/api/godot-desktop/witness')
  const post = (origin, id = 'game', body = { projectId: 'p', expectedStateRevision: 1 }) => route.fetch(new Request('http://localhost/api/godot-desktop/witness?workspaceId=' + id, { method: 'POST', headers: origin ? { origin } : {}, body: JSON.stringify(body) }))
  expect((await post('')).status).toBe(403)
  expect((await post('https://foreign.example')).status).toBe(403)
  expect((await post('http://localhost', 'unknown')).status).toBe(404)
  expect(witness.run).not.toHaveBeenCalled()
  expect((await post('http://localhost')).status).toBe(200)
  expect(witness.run).toHaveBeenCalledWith(f.path, { projectId: 'p', expectedStateRevision: 1 })
  expect((await route.fetch(new Request('http://localhost/api/godot-desktop/witness?workspaceId=game'))).status).toBe(200)
  expect(witness.report).toHaveBeenCalledWith(f.path)
})
