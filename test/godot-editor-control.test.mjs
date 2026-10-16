import { afterEach, expect, it } from 'vitest'
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EditorControl } from '../packages/dsh-godot-stack/bridge/editor-control.mjs'

const controls = []
afterEach(() => { for (const control of controls.splice(0)) control.stop() })
function fixture(options) { const control = new EditorControl(options); controls.push(control); return control }
const heartbeat = { projectPath: process.cwd(), editorId: 'editor-a' }

it('matches the same physical project across directory aliases and preserves editor ownership', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'godot-editor-alias-')))
  const project = join(root, 'project')
  const alias = join(root, 'alias')
  try {
    await mkdir(project)
    await symlink(project, alias, process.platform === 'win32' ? 'junction' : 'dir')
    const control = fixture()
    control.poll({ projectPath: alias, editorId: 'editor-a' })
    expect(() => control.poll({ projectPath: project, editorId: 'editor-b' })).toThrow('another editor')
    const result = control.execute({ projectPath: project, action: 'status' })
    const [command] = control.poll({ projectPath: alias, editorId: 'editor-a' })
    expect(command.action).toBe('status')
    control.poll({ projectPath: project, editorId: 'editor-a', results: [{ id: command.id, result: { ok: true, playing: false } }] })
    expect(await result).toEqual({ ok: true, playing: false })
    expect(control.editors.size).toBe(1)
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('delivers native commands once, serializes ownership and accepts only the owner reply', async () => {
  const control = fixture()
  control.poll(heartbeat)
  const result = control.execute({ projectPath: process.cwd(), action: 'play' })
  const [command] = control.poll(heartbeat)
  expect(command.action).toBe('play')
  expect(command.expiresAt).toBeGreaterThan(Date.now())
  expect(control.poll(heartbeat)).toEqual([])
  expect(() => control.execute({ projectPath: process.cwd(), action: 'stop' })).toThrow('in progress')
  expect(() => control.poll({ ...heartbeat, editorId: 'editor-b' })).toThrow('another editor')
  control.poll({ ...heartbeat, results: [{ id: command.id, result: { ok: true, playing: true } }] })
  expect(await result).toEqual({ ok: true, playing: true })
  expect(() => control.poll({ ...heartbeat, results: [{ id: command.id, result: { ok: true } }] })).toThrow('expired')
})

it('does not replay timed-out commands when the editor reconnects', async () => {
  const control = fixture({ timeoutMs: 20 })
  expect(() => control.execute({ projectPath: process.cwd(), action: 'play' })).toThrow('not connected')
  control.poll(heartbeat)
  await expect(control.execute({ projectPath: process.cwd(), action: 'play' })).rejects.toThrow('outcome unknown')
  expect(control.poll(heartbeat)).toEqual([])
})

it('withdraws commands on disposal and validates actions before native dispatch', async () => {
  const control = fixture()
  control.poll(heartbeat)
  expect(() => control.execute({ projectPath: process.cwd(), action: 'shell' })).toThrow('invalid')
  const result = control.execute({ projectPath: process.cwd(), action: 'play' })
  control.stop()
  await expect(result).rejects.toThrow('stopped')
})
