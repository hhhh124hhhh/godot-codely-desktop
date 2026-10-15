import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { expect, it } from 'vitest'

const asset = name => readFile(resolve('.build/brand-assets', name))

it('ships matching light/dark silhouettes with transparent backgrounds', async () => {
  const light = await sharp(await asset('logo-light.png')).ensureAlpha().raw().toBuffer()
  const dark = await sharp(await asset('logo-dark.png')).ensureAlpha().raw().toBuffer()
  expect(light.equals(dark)).toBe(false)
  const alpha = bytes => bytes.filter((_, index) => index % 4 === 3)
  expect(alpha(light)).toEqual(alpha(dark))
  expect(alpha(light).includes(0)).toBe(true)
  expect(alpha(light).includes(255)).toBe(true)
})

it('embeds decodable PNG frames at every Windows icon size', async () => {
  const ico = await asset('icon.ico')
  expect(ico.readUInt16LE(2)).toBe(1)
  const count = ico.readUInt16LE(4)
  expect(count).toBe(7)
  for (let index = 0; index < count; index++) {
    const entry = 6 + index * 16
    const width = ico[entry] || 256
    const start = ico.readUInt32LE(entry + 12)
    const metadata = await sharp(ico.subarray(start, start + ico.readUInt32LE(entry + 8))).metadata()
    expect(metadata.width).toBe(width)
    expect(metadata.height).toBe(width)
    expect(metadata.hasAlpha).toBe(true)
  }
})

it('embeds valid macOS icon chunks through 1024px', async () => {
  const icns = await asset('icon.icns')
  expect(icns.toString('ascii', 0, 4)).toBe('icns')
  expect(icns.readUInt32BE(4)).toBe(icns.length)
  const sizes = []
  for (let offset = 8; offset < icns.length;) {
    const length = icns.readUInt32BE(offset + 4)
    expect(length).toBeGreaterThan(8)
    const metadata = await sharp(icns.subarray(offset + 8, offset + length)).metadata()
    sizes.push(metadata.width)
    offset += length
  }
  expect(sizes).toEqual([16, 32, 64, 128, 256, 512, 1024])
})
