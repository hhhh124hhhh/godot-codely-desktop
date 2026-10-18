import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const presetDir = join(
  process.cwd(),
  'packages/dsh-godot-stack/godot-stack/agent-presets/godot-codely-lite'
)

function personaFromPreset(yaml) {
  const lines = yaml.split(/\r?\n/)
  const start = lines.findIndex((line) => line === '    prefix: |-')
  if (start < 0) throw new Error('missing persona prefix block')
  const body = []
  for (const line of lines.slice(start + 1)) {
    if (line === '') {
      body.push('')
      continue
    }
    if (!line.startsWith('      ')) break
    body.push(line.slice(6))
  }
  return body.join('\n').replace(/\n+$/, '')
}

describe('godot-codely-lite persona sync', () => {
  it('keeps SYSTEM_PROMPT.md and config.prefix identical', async () => {
    const prompt = (await readFile(join(presetDir, 'SYSTEM_PROMPT.md'), 'utf8')).replace(/\n+$/, '')
    const yaml = await readFile(join(presetDir, 'agent.cordis.yml'), 'utf8')
    expect(personaFromPreset(yaml)).toBe(prompt)
    expect(yaml).toContain("name: '@deepseek-ai/dsh-persona'")
    expect(yaml).not.toMatch(/^\s+text:/m)
    expect(prompt).toBe(
      [
        'You are a helpful Godot coding agent powered by the {{model}} model. Working directory is {{cwd}}.',
        'Tools: mcp__godot__* (godot-mcp-server). You cannot touch live engine objects; edit .tscn/.gd via tools only.',
        '',
        'Hard rules:',
        '1) Read before write: scenes.info / nodes.list / scripts.read before any edit. Never invent node paths.',
        '2) One intent per change; verify with scenes.info or one concrete check, then stop unless broken.',
        '3) On errors: locate file/line, patch only that; do not rewrite whole scripts.',
        '4) Unknown tool args → mcp__godot__help first.',
        '5) Session start: config status; if project_path wrong, list_projects then config set project_path.',
        '6) Prefer existing project patterns; do not add tests/refactors/deps unless asked.',
        '7) Reply in 中文: 做了什么 / 如何验证 / 残留风险.',
        '',
        'Working contract (Decide & Verify): decide build-or-fix in one step; after writing, run ONE concrete check',
        '(prefer scenes.info / scripts.read; use project.run only for behavior that needs the engine); if it fails,',
        'fix once then stop; no env re-checks; end with 改了什么 / 验证了什么 / 风险.',
        '',
        'Deep docs (load only when needed): docs/methodology-2.0.md, docs/loop-examples.md, docs/zfoo-framework.md'
      ].join('\n')
    )
    expect(prompt).not.toContain('先五人团')
    expect(prompt).not.toContain('三道闸')
  })

  it('keeps tiered verification and team routing off the hot path', async () => {
    const docs = join(presetDir, 'docs')
    const methodology = await readFile(join(docs, 'methodology-2.0.md'), 'utf8')
    const loops = await readFile(join(docs, 'loop-examples.md'), 'utf8')
    const zfoo = await readFile(join(docs, 'zfoo-framework.md'), 'utf8')
    const routing = await readFile(join(docs, 'team-routing.md'), 'utf8')
    expect(methodology).toContain('scenes.info')
    expect(methodology).toContain('project.run')
    expect(methodology).toContain('Phase 3')
    expect(methodology).toContain('小改动')
    expect(methodology).toContain('team-routing.md')
    expect(loops).toContain('mcp__godot__help')
    expect(zfoo).toContain('Audio.play_music')
    const gdscript = await readFile(join(process.cwd(), 'packages/dsh-godot-stack/skills/godot/gdscript/SKILL.md'), 'utf8')
    expect(gdscript).toContain('docs/zfoo-framework.md')
    expect(gdscript).toContain('Audio.play_music')
    const workflow = await readFile(join(process.cwd(), 'packages/dsh-godot-stack/skills/godot/project-workflow/SKILL.md'), 'utf8')
    expect(workflow).not.toContain('先给出路由建议')
    expect(routing).toContain('五人团')
    expect(routing).toContain('不要先做五人团')
    expect(routing).toContain('godot-scene-expert')
  })
})
