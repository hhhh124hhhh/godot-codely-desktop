import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { provisionGodotPresets } from '../packages/dsh-godot-stack/index.js'
import { adoptLegacyMemories, memoryRoot, sanitizeTopic } from '../packages/dsh-godot-stack/memory-root.mjs'
import { cliHome, tokenCandidatePaths } from '../packages/dsh-godot-stack/data-home.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('factory expert presets', () => {
  it('copies lite and the three experts into a fresh home', async () => {
    const home = await mkdtemp(join(tmpdir(), 'godot-presets-'))
    roots.push(home)
    await provisionGodotPresets(home)
    const lite = await readFile(join(home, '.agent-presets/godot-codely-lite/agent.cordis.yml'), 'utf8')
    expect(lite).toContain('godot-scene-expert')
    expect(lite).toContain('godot-shader-expert')
    expect(lite).toContain('godot-gdscript-expert')
    for (const name of ['godot-scene-expert', 'godot-shader-expert', 'godot-gdscript-expert']) {
      const agent = await readFile(join(home, '.agent-presets', name, 'agent.cordis.yml'), 'utf8')
      expect(agent, name).toContain('工具与边界')
      expect(agent, name).toContain('失败出口')
      expect(await readFile(join(home, '.agent-presets', name, 'preset.yml'), 'utf8')).toContain('name:')
    }
  })
})

describe('shared memory root', () => {
  it('ignores the desktop harness DSH_HOME and adopts missing legacy topics', async () => {
    const home = await mkdtemp(join(tmpdir(), 'godot-memory-root-'))
    roots.push(home)
    const desktop = join(home, 'harness')
    const user = join(home, 'user')
    await mkdir(join(desktop, 'memories'), { recursive: true })
    await mkdir(join(user, '.godot-codely/memories'), { recursive: true })
    await writeFile(join(desktop, 'memories/only_legacy.md'), 'legacy-fact', 'utf8')
    await writeFile(join(desktop, 'memories/from_desktop.md'), 'desktop-fact', 'utf8')
    await writeFile(join(user, '.godot-codely/memories/from_desktop.md'), 'keep-shared', 'utf8')
    const previous = {
      HOME: process.env.HOME,
      USERPROFILE: process.env.USERPROFILE,
      DSH_HOME: process.env.DSH_HOME,
      GODOT_CODELY_MEMORY_DIR: process.env.GODOT_CODELY_MEMORY_DIR,
    }
    process.env.HOME = user
    process.env.USERPROFILE = user
    process.env.DSH_HOME = desktop
    delete process.env.GODOT_CODELY_MEMORY_DIR
    try {
      expect(memoryRoot()).toBe(join(user, '.godot-codely', 'memories'))
      expect(adoptLegacyMemories()).toBe(join(user, '.godot-codely', 'memories'))
      expect(await readFile(join(user, '.godot-codely/memories/only_legacy.md'), 'utf8')).toBe('legacy-fact')
      expect(await readFile(join(user, '.godot-codely/memories/from_desktop.md'), 'utf8')).toBe('keep-shared')
      expect(sanitizeTopic('../outside')).toBeNull()
      expect(sanitizeTopic('topic_a')).toBe('topic_a')
      expect(cliHome({ DSH_HOME: '' }, user)).toBe(join(user, '.godot-codely'))
      const tokens = tokenCandidatePaths({ APPDATA: join(user, 'AppData', 'Roaming') }, user)
      expect(tokens.some((candidate) => candidate.includes(`${join('godot-codely', 'harness')}`))).toBe(true)
      expect(tokens.some((candidate) => candidate.includes('dsh-desktop'))).toBe(false)
      expect(tokens.some((candidate) => candidate.endsWith(join('.dsh', 'godot-codely-launch-token')))).toBe(false)
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })
})
