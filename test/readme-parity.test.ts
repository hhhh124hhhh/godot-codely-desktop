import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readmes = [
  'README.md',
  'README.zh.md',
  'README.ja.md',
  'README.ru.md',
  'README.es.md',
  'README.pt.md'
]

const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> }
const requiredFacts = [
  `@deepseek-ai/dsh@${manifest.dependencies['@deepseek-ai/dsh']}`,
  'DOCX',
  'PPTX',
  'XLSX',
  '--safe-mode',
  'Cloudflare Quick Tunnel',
  'NSIS',
  'docs/development.md',
  'docs/architecture.md'
]

describe('localized README parity', () => {
  for (const path of readmes) {
    it(`${path} carries the current product facts`, () => {
      const content = readFileSync(path, 'utf8')

      for (const fact of requiredFacts) expect(content).toContain(fact)
      expect(content).not.toContain('@deepseek-ai/dsh@0.1.1-rc.1')
      expect(content).not.toMatch(/NSIS\s*(?:and|与|と|и|y|e)\s*Portable/i)
    })
  }

  it('keeps every relative Markdown link resolvable', () => {
    const documents = [
      ...readmes,
      'CONTRIBUTING.md',
      'CODE_OF_CONDUCT.md',
      'SECURITY.md',
      'docs/development.md',
      'docs/architecture.md',
      'docs/release-runbook.md',
      'docs/preset-packages.md',
      'docs/office-runtime.md'
    ]

    for (const path of documents) {
      const content = readFileSync(path, 'utf8')
      const links = content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)

      for (const match of links) {
        const target = match[1]
        if (!target) continue
        if (/^(?:https?:|mailto:)/.test(target)) continue
        const withoutAnchor = target.split('#', 1)[0]
        if (!withoutAnchor) continue
        expect(
          existsSync(resolve(dirname(path), decodeURIComponent(withoutAnchor))),
          `${path} links to missing ${target}`
        ).toBe(true)
      }
    }
  })

  it('identifies this fork and does not send clones to upstream', () => {
    const forkClone = 'git clone https://github.com/hhhh124hhhh/godot-codely-desktop.git'
    const upstreamClone = 'git clone https://github.com/dataelement/dsh-desktop.git'

    for (const path of readmes) {
      const content = readFileSync(path, 'utf8')
      expect(content).toContain('https://github.com/hhhh124hhhh/godot-codely-desktop')
      expect(content).toContain('godot-codely')
      expect(content).toContain(forkClone)
      expect(content).not.toContain(upstreamClone)
      expect(content).toMatch(/<h1[^>]*>[\s\S]*\n\s*Godot Codely\s*\n<\/h1>/)
      expect(content).not.toMatch(/<h1[^>]*>[\s\S]*\n\s*DSH Desktop\s*\n<\/h1>/)
    }

    const development = readFileSync('docs/development.md', 'utf8')
    expect(development).toContain(forkClone)
    expect(development).not.toContain(upstreamClone)
    expect(existsSync('CONTRIBUTING.md')).toBe(true)
    expect(existsSync('CODE_OF_CONDUCT.md')).toBe(true)
    expect(existsSync('SECURITY.md')).toBe(true)
    expect(existsSync('.github/ISSUE_TEMPLATE/bug_report.md')).toBe(true)
    expect(existsSync('.github/ISSUE_TEMPLATE/config.yml')).toBe(true)
    expect(existsSync('.github/PULL_REQUEST_TEMPLATE.md')).toBe(true)
  })

  it('does not publish internal working documents', () => {
    expect(existsSync('docs/preset-square-mvp.md')).toBe(false)
    expect(existsSync('docs/windows-profile-repair.md')).toBe(false)
  })
})
