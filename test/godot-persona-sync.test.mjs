import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const presetDir = join(process.cwd(), 'packages/dsh-godot-stack/godot-stack/agent-presets/godot-codely-lite')
const normalize = text => text.replaceAll('\r\n', '\n').replace(/\n+$/, '')
const yamlOptions = { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] }

describe('godot-codely-lite persona sync', () => {
  it.each(['\n', '\r\n'])('keeps source persona copies in sync with %j newlines', async newline => {
    const prompt = normalize(await readFile(join(presetDir, 'SYSTEM_PROMPT.md'), 'utf8')).replaceAll('\n', newline)
    const yaml = normalize(await readFile(join(presetDir, 'agent.cordis.yml'), 'utf8')).replaceAll('\n', newline)
    const rows = parse(yaml, yamlOptions)
    const persona = rows.find(row => row.name === '@deepseek-ai/dsh-persona')
    expect(normalize(persona.config.prefix)).toBe(normalize(prompt))
    expect(persona.config).not.toHaveProperty('text')
    // Keep the contract short without duplicating its full wording in a third copy.
    expect(prompt.length).toBeLessThan(2400)
    expect(prompt).toContain('__GODOT_CODELY_DOCS_ROOT__')
    expect(prompt).not.toContain('fix once then stop')
    expect(prompt).not.toContain('ONE concrete check')
    expect(prompt).not.toContain('先五人团')
  })

  it('keeps long methodology and team routing in optional docs', async () => {
    const docs = join(presetDir, 'docs')
    const methodology = await readFile(join(docs, 'methodology-2.0.md'), 'utf8')
    const loops = await readFile(join(docs, 'loop-examples.md'), 'utf8')
    const zfoo = await readFile(join(docs, 'zfoo-framework.md'), 'utf8')
    const routing = await readFile(join(docs, 'team-routing.md'), 'utf8')
    expect(methodology).toContain('Phase 3')
    expect(methodology).toContain('修复后重跑失败项')
    expect(loops).toContain('mcp__godot__help')
    expect(zfoo).toContain('Audio.play_music')
    expect(routing).toContain('godot-scene-expert')
    expect(routing).toContain('不要先做五人团')
  })
})
