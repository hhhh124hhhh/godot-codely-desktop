import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { afterEach, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const asar = require('@electron/asar')
const verifyGameScope = require('../scripts/verify-game-scope.cjs')
const roots = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
it('accepts the game package and rejects stale Office/PPT packages and Python payloads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'game-package-')); roots.push(root)
  for (const name of ['dsh-godot-stack', 'dsh-desktop-office', 'dsh-ppt-composer', '@deepseek-ai/dsh-office-to-pdf', '@deepseek-ai/libreoffice-kit-win32-x64']) {
    const source = join(root, 'input-' + name.replaceAll('/', '-'))
    const resources = join(root, 'resources-' + name.replaceAll('/', '-'))
    const directory = join(source, 'node_modules', name)
    await mkdir(directory, { recursive: true }); await mkdir(resources)
    await writeFile(join(directory, 'index.js'), 'export const name = "fixture"\n')
    await asar.createPackage(source, join(resources, 'app.asar'))
    if (name === 'dsh-godot-stack') {
      expect(() => verifyGameScope(resources)).not.toThrow()
      await mkdir(join(resources, 'office-runtime'))
      expect(() => verifyGameScope(resources)).toThrow('Office Python payload')
    } else expect(() => verifyGameScope(resources)).toThrow('Office/PPT package')
  }
})
