import { afterEach, expect, it } from 'vitest'
import { EditorControl } from '../packages/dsh-godot-stack/bridge/editor-control.mjs'

const controls = []
afterEach(() => { for (const control of controls.splice(0)) control.stop() })
function fixture(options) { const control = new EditorControl(options); controls.push(control); return control }
const heartbeat = { projectPath: process.cwd(), editorId: 'editor-a' }

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
