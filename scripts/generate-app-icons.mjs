import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, '.build/brand-assets')
const source = await readFile(path.join(root, 'build/brand-mark.svg'), 'utf8')
await mkdir(output, { recursive: true })
const raster = (size, svg = source) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()
await writeFile(path.join(output, 'icon.png'), await raster(1024))
await writeFile(path.join(output, 'logo-light.png'), await raster(256, source.replace('color="#2459d8"', 'color="#111827"')))
await writeFile(path.join(output, 'logo-dark.png'), await raster(256, source.replace('color="#2459d8"', 'color="#ffffff"')))

const sizes = [16, 24, 32, 48, 64, 128, 256]
const images = await Promise.all(sizes.map(size => raster(size)))
const header = Buffer.alloc(6 + images.length * 16)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(images.length, 4)
let offset = header.length
for (const [index, image] of images.entries()) {
  const size = sizes[index]
  const entry = 6 + index * 16
  header[entry] = size === 256 ? 0 : size
  header[entry + 1] = header[entry]
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(image.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += image.length
}
await writeFile(path.join(output, 'icon.ico'), Buffer.concat([header, ...images]))

// Modern ICNS entries carry PNG data, so native macOS tools are unnecessary.
const chunks = []
for (const [type, size] of [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]]) {
  const image = await raster(size)
  const chunk = Buffer.alloc(8)
  chunk.write(type)
  chunk.writeUInt32BE(8 + image.length, 4)
  chunks.push(chunk, image)
}
const icns = Buffer.alloc(8)
icns.write('icns')
icns.writeUInt32BE(8 + chunks.reduce((size, chunk) => size + chunk.length, 0), 4)
await writeFile(path.join(output, 'icon.icns'), Buffer.concat([icns, ...chunks]))
console.log('Generated PNG, ICO and ICNS from build/brand-mark.svg')
