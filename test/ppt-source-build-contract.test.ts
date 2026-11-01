import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { projectRoot } from './patch-path'

const generatedPatterns = [
  'packages/ppt-bundles',
  'packages/ppt-runtime/templates',
  'packages/ppt-runtime/artifacts.json'
]

describe('PPT source build contract', () => {
  it('does not track self-built packages, templates, previews, or hash manifests', () => {
    const tracked = execFileSync('git', ['ls-files', ...generatedPatterns], {
      cwd: projectRoot,
      encoding: 'utf8'
    }).trim()
    expect(tracked).toBe('')
  })

  it('bootstraps from local source packages without generated tgz dependencies', async () => {
    const manifest = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'))
    const lock = await readFile(path.join(projectRoot, 'package-lock.json'), 'utf8')
    expect(manifest.dependencies['dsh-ppt']).toBe('file:packages/ppt-runtime/core')
    expect(manifest.dependencies['dsh-ppt-composer']).toBe('file:packages/ppt-runtime/adapter')
    expect(lock).not.toContain('ppt-bundles')
  })

  it('retains explicit legacy preparation without making game builds consume PPT', async () => {
    const manifest = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'))
    expect(manifest.scripts['ppt:build']).toBe('node scripts/prepare-ppt-runtime.mjs')
    for (const name of ['pretest', 'pretest:watch']) {
      const steps = manifest.scripts[name].split(' && ')
      expect(steps).toContain('npm run ppt:build')
    }
    for (const name of ['dev', 'build', 'build:linux-pack']) {
      expect(manifest.scripts[name]).not.toContain('ppt:build')
      expect(manifest.scripts[name]).not.toContain('office:prepare')
      expect(manifest.scripts[name]).toContain('godot:build')
    }
    for (const name of Object.keys(manifest.scripts).filter(name => name.startsWith('package:'))) {
      expect(manifest.scripts[name]).toContain('npm run build')
    }
  })

  it('excludes the suspended Office/PPT packages and generated payloads from the game product', async () => {
    const manifest = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'))
    const files = manifest.build.files
    expect(manifest.build.afterPack).toBe('scripts/after-pack.cjs')
    expect(files).toContain('!node_modules/dsh-ppt{,/**}')
    expect(files).toContain('!node_modules/dsh-ppt-composer{,/**}')
    expect(files).toContain('!node_modules/dsh-desktop-office{,/**}')
    expect(files.some((entry: unknown) => typeof entry === 'object' && entry !== null && 'from' in entry && String(entry.from).includes('.build/ppt-runtime'))).toBe(false)
    expect(manifest.build.extraResources.some((entry: { from: string }) => entry.from === '.build/office-runtime')).toBe(false)
  })
})
