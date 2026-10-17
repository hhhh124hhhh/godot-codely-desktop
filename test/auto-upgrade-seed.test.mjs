import { createRequire } from 'node:module'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { seedUpdateVersion } from '../scripts/seed-update-version.mjs'

const asar = createRequire(import.meta.url)('@electron/asar')
it('changes only the declared version fixture and its integrity while preserving packaged code and unpacked files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'update-seed-'))
  try {
    const source = join(root, 'source')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(source)
    await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'fixture', version: '0.1.4', main: 'main.js' }))
    await writeFile(join(source, 'main.js'), 'console.log("shipped code unchanged")')
    await writeFile(join(source, 'addon.node'), 'unpacked fixture')
    const archive = join(root, 'app.asar')
    await asar.createPackageWithOptions(source, archive, { unpack: '*.node' })
    const before = asar.getRawHeader(archive).header
    const result = await seedUpdateVersion(archive, '0.1.4', '0.1.3')
    expect(result.shippedAsarSha256).not.toBe(result.fixtureAsarSha256)
    expect(JSON.parse(asar.extractFile(archive, 'package.json')).version).toBe('0.1.3')
    expect(asar.extractFile(archive, 'main.js').toString()).toBe('console.log("shipped code unchanged")')
    expect(await readFile(archive + '.unpacked/addon.node', 'utf8')).toBe('unpacked fixture')
    const after = asar.getRawHeader(archive).header
    expect(after.files['main.js']).toEqual(before.files['main.js'])
    expect(after.files['addon.node']).toEqual(before.files['addon.node'])
    const bytes = await readFile(archive)
    await expect(seedUpdateVersion(archive, '0.1.4', '0.1.2')).rejects.toThrow()
    expect(await readFile(archive)).toEqual(bytes)
    await expect(seedUpdateVersion(archive, '0.1.3', '0.1.30')).rejects.toThrow()
    expect(await readFile(archive)).toEqual(bytes)
  } finally { await rm(root, { recursive: true, force: true }) }
})
