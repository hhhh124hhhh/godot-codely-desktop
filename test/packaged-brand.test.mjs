import { mkdtemp, mkdir, writeFile, rm, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { describe, it, expect } from 'vitest'
const require = createRequire(import.meta.url)
const { createPackage } = require('@electron/asar')
const { verifyPackagedBrand } = require('../scripts/verify-packaged-brand.cjs')

describe('packaged brand resource consistency', () => {
  it('accepts this build and rejects stale client and import icons', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codely-brand-'))
    try {
      const generated = join(root, '.build/brand-assets')
      const frontend = join(root, 'source/node_modules/@deepseek-ai/dsh-web-frontend/dist')
      const resources = join(root, 'resources')
      await Promise.all([generated, frontend, resources].map(directory => mkdir(directory, { recursive: true })))
      for (const [source, destination] of [['icon.png', 'dsh-desktop-logo.png'], ['logo-light.png', 'dsh-desktop-logo-light.png'], ['logo-dark.png', 'dsh-desktop-logo-dark.png']]) {
        await writeFile(join(generated, source), Buffer.from(source))
        await copyFile(join(generated, source), join(frontend, destination))
      }
      await copyFile(join(generated, 'icon.png'), join(resources, 'icon.png'))
      await createPackage(join(root, 'source'), join(resources, 'app.asar'))
      await expect(verifyPackagedBrand(resources, root)).resolves.toBeUndefined()
      await writeFile(join(resources, 'icon.png'), 'old import logo')
      await expect(verifyPackagedBrand(resources, root)).rejects.toThrow('window/import icon is stale')
      await copyFile(join(generated, 'icon.png'), join(resources, 'icon.png'))
      await writeFile(join(generated, 'logo-dark.png'), 'new dark brand')
      await expect(verifyPackagedBrand(resources, root)).rejects.toThrow('dsh-desktop-logo-dark.png')
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
