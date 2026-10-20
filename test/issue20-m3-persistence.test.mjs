import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { apply } from '@deepseek-ai/dsh-workspace-changes'
import { apply as applyDeliverables } from '@deepseek-ai/dsh-client-ui-deliverables'

const roots = []
afterEach(async () => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 5 })
})

function harness() {
  const listeners = new Map()
  let service
  let cleanup
  const ctx = {
    subprocess: { resolveExecutable: vi.fn(async () => null) },
    logger: { info: vi.fn(), warn: vi.fn() },
    effect: effect => { cleanup = effect() },
    on: (event, listener) => { listeners.set(event, listener) },
    provide: (name, value) => { if (name === 'workspaceChanges') service = value },
  }
  apply(ctx, { timeoutMs: 1000, outputMaxBytes: 1024 * 1024, maxFiles: 100, maxFileBytes: 2 * 1024 * 1024, diffTimeoutMs: 100 })
  return { listeners, service: () => service, dispose: () => cleanup?.() }
}

async function changedTurn() {
  const root = await mkdtemp(join(tmpdir(), 'workspace-changes-replay-'))
  roots.push(root)
  const home = join(root, 'home')
  const project = join(root, 'project')
  await mkdir(home)
  await mkdir(project)
  const file = join(project, 'player.gd')
  await writeFile(file, 'before\n')
  vi.stubEnv('DSH_HOME', home)
  const runtime = harness()
  let seq = 0
  const session = {
    id: 'm3-session',
    header: { cwd: project, origin: 'user' },
    append(type, data) { const event = { type, data, seq: ++seq }; return event },
  }
  const sessionEvent = runtime.listeners.get('session/event')
  await sessionEvent(session, { type: 'turn/start', data: { turn: 1 }, seq: 0 })
  await runtime.listeners.get('tools/pre-execute')({
    agent: { session },
    name: 'write',
    arguments: { file_path: 'player.gd', content: 'after\n' },
  }, async () => writeFile(file, 'after\n'))
  sessionEvent(session, { type: 'tool/result', data: { turn: 1 }, seq: 2 })
  await runtime.listeners.get('agent/turn-stopping')({ agent: { session }, turn: 1 })
  return { home, project, file, runtime, session, seq }
}

it('replays a project diff after Host restart and keeps the captured result when the live file changes', async () => {
  const f = await changedTurn()
  const liveSummary = await f.runtime.service().summary(f.session.id, f.seq)
  expect(liveSummary.files.map(file => file.path)).toEqual(['player.gd'])
  const liveDiff = await f.runtime.service().diff(f.session.id, f.seq, 0, new AbortController().signal)
  expect(liveDiff.kind).toBe('text')
  expect(liveDiff.hunks.flatMap(hunk => hunk.lines)).toContain('-before')
  expect(liveDiff.hunks.flatMap(hunk => hunk.lines)).toContain('+after')

  await writeFile(f.file, 'later external edit\n')
  await f.runtime.dispose()
  const reopened = harness()
  const restoredSummary = await reopened.service().summary(f.session.id, f.seq)
  const restoredDiff = await reopened.service().diff(f.session.id, f.seq, 0, new AbortController().signal)
  expect(restoredSummary.files).toEqual(liveSummary.files)
  expect(restoredDiff).toEqual(liveDiff)
  expect(restoredDiff.hunks.flatMap(hunk => hunk.lines)).not.toContain('+later external edit')
  await reopened.dispose()
})

it('fails closed when a persisted diff receipt is damaged', async () => {
  const f = await changedTurn()
  await f.runtime.dispose()
  const key = createHash('sha256').update(f.session.id).digest('hex')
  await writeFile(join(f.home, 'workspace-changes', key, `${f.seq}.json`), '{')
  const reopened = harness()
  expect(await reopened.service().summary(f.session.id, f.seq)).toBeUndefined()
  expect(await reopened.service().diff(f.session.id, f.seq, 0, new AbortController().signal)).toBeUndefined()
  await reopened.dispose()
})

it('rejects a checksummed receipt whose decoded summary does not match its schema', async () => {
  const f = await changedTurn()
  await f.runtime.dispose()
  const key = createHash('sha256').update(f.session.id).digest('hex')
  const receiptPath = join(f.home, 'workspace-changes', key, `${f.seq}.json`)
  const envelope = JSON.parse(await readFile(receiptPath, 'utf8'))
  envelope.record.summary.files[0].path = null
  envelope.sha256 = createHash('sha256').update(JSON.stringify(envelope.record)).digest('hex')
  await writeFile(receiptPath, JSON.stringify(envelope))
  const reopened = harness()
  expect(await reopened.service().summary(f.session.id, f.seq)).toBeUndefined()
  await reopened.dispose()
})

it('serves persisted change evidence only for a durable workspace/changes event', async () => {
  const f = await changedTurn()
  await f.runtime.dispose()
  const reopened = harness()
  const routes = new Map()
  const ctx = {
    connection: { fetch: { register: route => routes.set(route.path, route) } },
    effect: () => {},
    systemPrompt: { section: () => {}, getSectionOrder: () => 0 },
    sessionQuery: { readEvent: vi.fn(async () => ({ target: { type: 'workspace/changes', data: { turn: 1 } }, session: { cwd: f.project } })) },
    workspaceChanges: reopened.service(),
  }
  applyDeliverables(ctx)
  const request = new Request(`http://dsh.internal/api/changes.summary?sessionId=${f.session.id}&seq=${f.seq}`)
  const route = routes.get('/api/changes.summary')
  const response = await route.fetch(request)
  expect(response.status).toBe(200)
  expect((await response.json()).files.map(file => file.path)).toEqual(['player.gd'])
  const diffRoute = routes.get('/api/changes.diff')
  const diffResponse = await diffRoute.fetch(new Request(`http://dsh.internal/api/changes.diff?sessionId=${f.session.id}&seq=${f.seq}&index=0`))
  expect(diffResponse.status).toBe(200)
  expect((await diffResponse.json()).hunks.flatMap(hunk => hunk.lines)).toContain('+after')

  ctx.sessionQuery.readEvent = vi.fn(async () => ({ target: { type: 'unrelated/event', data: { turn: 1 } }, session: { cwd: f.project } }))
  const rejected = await route.fetch(request)
  expect(rejected.status).toBe(404)
  expect(await rejected.text()).toBe('Change event not found.')
  const rejectedDiff = await diffRoute.fetch(new Request(`http://dsh.internal/api/changes.diff?sessionId=${f.session.id}&seq=${f.seq}&index=0`))
  expect(rejectedDiff.status).toBe(404)
  ctx.sessionQuery.readEvent = vi.fn(async () => { throw Object.assign(new Error('missing session'), { code: 'SESSION_QUERY_SESSION_NOT_FOUND' }) })
  const missingSession = await route.fetch(request)
  expect(missingSession.status).toBe(404)
  await reopened.dispose()
})
