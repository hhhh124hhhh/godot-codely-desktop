import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

const code = await readFile(new URL('../packages/dsh-godot-stack/client.js', import.meta.url), 'utf8')
it('distinguishes a Windows engine crash from a normal stop and exposes its output', () => {
  function render(exitCode, running = false) {
    let Panel
    const values = [{ path: '/godot', running, exitCode, logs: 'CrashHandlerException: signal 11' }, '', false]
    let index = 0
    const react = { ...React, useState: () => [values[index++], () => {}], useEffect: () => {}, useRef: value => ({ current: value }) }
    vm.runInNewContext(code, { window: { __GODOT_DESKTOP_ENGINE__: {}, __ModuleLoader__: { load({ factory }) { Panel = factory(() => react).EnginePanel } } } })
    return renderToStaticMarkup(Panel({ workspaceId: 'game', active: true, t: key => key }))
  }
  for (const exitCode of [3221225477, -1073741819]) {
    const markup = render(exitCode)
    expect(markup).toContain('engineCrashed')
    expect(markup).toContain('engineCrashHelp')
    expect(markup).toContain('<details open="">')
    expect(markup).toContain('CrashHandlerException: signal 11')
  }
  expect(render(0)).not.toContain('engineCrashed')
  expect(render(1)).not.toContain('engineCrashed')
  expect(render(3221225477, true)).not.toContain('engineCrashed')
})
function fixture({ project = { godot: true, path: '/game', name: 'Actual game' }, session = null, request, loadProject = false } = {}) {
  let Desktop
  let stateIndex = 0
  const cleanups = []
  const setters = []
  const fetch = request || vi.fn(async () => Response.json({ sessionId: 'created' }))
  const values = ['', 'overview', true, project, '', false, 0, null, null]
  const react = { ...React, useState: () => { const setter = vi.fn(); setters.push(setter); return [values[stateIndex++], setter] }, useEffect: callback => { const cleanup = callback(); if (cleanup) cleanups.push(cleanup) }, useRef: value => ({ current: value }), useCallback: fn => fn, useSyncExternalStore: (_subscribe, snapshot) => snapshot() }
  // Project reads are covered by the backend tests. Do not run data-loading effects in this render fixture.
  let effectIndex = 0
  react.useEffect = callback => { const index = effectIndex++; if (index === 2 || (loadProject && index === 0)) cleanups.push(callback()) }
  vm.runInNewContext(code, { window: { innerWidth: 1280, __ModuleLoader__: { load({ factory }) { Desktop = factory(name => { if (name === 'react') return react; throw Error(name) }).Desktop } } }, fetch, AbortController, console })
  const subscribe = () => () => {}
  const store = value => ({ subscribe, getSnapshot: () => value })
  const ensureSession = vi.fn(async () => 'created')
  const ctx = { locale: store({ active: 'en' }), workspaces: { list: store({ items: [{ workspaceId: 'game', title: 'Game', path: '/game' }] }) }, sessions: { list: store({ ids: session ? ['native'] : [], byId: session ? { native: { cwd: '/game', displayTitle: 'Task' } } : {} }) }, desktopWorkbenches: { ensureSession } }
  const service = { subscribe, getSnapshot: () => ({ state: { sessionBindings: session ? { native: 'owner/repo' } : {} } }), currentSession: () => session ? 'native' : null, workspaceVisible: () => true, ensureSession: vi.fn(() => { throw Error('Host cannot claim provider identity') }) }
  const tree = Desktop({ service, ctx, entry: { id: 'owner/repo' }, active: true, conversation: session, t: key => key })
  const nodes = []
  const visit = node => { if (Array.isArray(node)) node.forEach(visit); else if (node && typeof node === 'object') { nodes.push(node); visit(node.props?.children) } }
  visit(tree)
  return { tree, nodes, ctx, service, fetch, ensureSession, cleanups, setters }
}
it('does not overwrite project metadata with a response completed after leaving the project', async () => {
  let finish
  const f = fixture({ loadProject: true, request: vi.fn(() => new Promise(resolve => { finish = resolve })) })
  expect(f.fetch).toHaveBeenCalledOnce()
  expect(f.setters[3]).toHaveBeenCalledWith(null)
  f.cleanups.forEach(cleanup => cleanup?.())
  finish(Response.json({ godot: true, path: '/old-project', name: 'Stale project' }))
  await new Promise(resolve => setImmediate(resolve))
  expect(f.setters[3]).toHaveBeenCalledTimes(1)
})
it('creates a Lite session through the API and binds it using the provider-scoped native service', async () => {
  const f = fixture()
  await f.nodes.find(node => node.type === 'button' && node.props.children === 'start').props.onClick()
  expect(f.fetch).toHaveBeenCalledOnce()
  expect(f.fetch.mock.calls[0][0]).toBe('/api/godot-desktop/session?workspaceId=game')
  expect(f.ensureSession).toHaveBeenCalledWith({ folder: '/game', sessionId: 'created' })
  expect(f.service.ensureSession).not.toHaveBeenCalled()
})
it('does not bind a late response after the user leaves or switches the project', async () => {
  let finish
  const f = fixture({ request: vi.fn(() => new Promise(resolve => { finish = resolve })) })
  const task = f.nodes.find(node => node.type === 'button' && node.props.children === 'start').props.onClick()
  f.cleanups.forEach(cleanup => cleanup?.())
  finish(Response.json({ sessionId: 'created' }))
  await task
  expect(f.ensureSession).not.toHaveBeenCalled()
})
it('keeps the native conversation mounted while showing overview, and blocks editor actions until checked', () => {
  const native = React.createElement('textarea', { 'aria-label': 'Native composer', defaultValue: 'Draft' })
  const f = fixture({ session: native })
  const markup = renderToStaticMarkup(f.tree)
  expect(markup).toContain('Native composer')
  expect(markup).toContain('Draft')
  expect(markup).toContain('Actual game')
  expect(f.nodes.find(node => node.type === 'button' && node.props.children === 'play').props.disabled).toBe(true)
  const ordinary = fixture({ project: { godot: false, path: '/game', name: 'Folder' } })
  expect(ordinary.nodes.some(node => node.type === 'button' && node.props.children === 'start')).toBe(false)
})
