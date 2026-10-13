import { readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIN_APP_IMAGE_BYTES = 80 * 1024 * 1024
const MIN_DMG_BYTES = 80 * 1024 * 1024
const MIN_EXE_BYTES = 80 * 1024 * 1024
const MIN_ZIP_BYTES = 80 * 1024 * 1024

async function fileSize(path) {
  const info = await stat(path)
  if (!info.isFile()) throw new Error(`Not a file: ${path}`)
  return info.size
}

async function assertAppImage(path) {
  const size = await fileSize(path)
  if (size < MIN_APP_IMAGE_BYTES) {
    throw new Error(`${path} is unexpectedly small (${size} bytes)`)
  }
  const handle = await import('node:fs/promises').then((fs) => fs.open(path, 'r'))
  try {
    const header = Buffer.alloc(4)
    await handle.read(header, 0, header.length, 0)
    if (!header.equals(Buffer.from('\x7fELF'))) {
      throw new Error(`${path} is not an ELF AppImage`)
    }
  } finally {
    await handle.close()
  }
}

async function assertPe(path) {
  const size = await fileSize(path)
  if (size < MIN_EXE_BYTES) throw new Error(`${path} is unexpectedly small (${size} bytes)`)
  const handle = await import('node:fs/promises').then((fs) => fs.open(path, 'r'))
  try {
    const header = Buffer.alloc(2)
    await handle.read(header, 0, 2, 0)
    if (!header.equals(Buffer.from('MZ'))) throw new Error(`${path} is not a PE executable`)
  } finally {
    await handle.close()
  }
}

async function assertZipOrDmg(path) {
  const size = await fileSize(path)
  const min = path.endsWith('.dmg') ? MIN_DMG_BYTES : MIN_ZIP_BYTES
  if (size < min) throw new Error(`${path} is unexpectedly small (${size} bytes)`)
}

export async function verifyUnsignedGithubRelease(releaseDir) {
  const root = resolve(releaseDir)
  const names = await readdir(root)
  const hits = {
    linux: names.filter((name) => name.endsWith('.AppImage')),
    mac: names.filter((name) => name.endsWith('.dmg') || (name.endsWith('.zip') && name.includes('-mac-'))),
    win: names.filter((name) => name.endsWith('-setup.exe'))
  }

  if (!hits.linux.length && !hits.mac.length && !hits.win.length) {
    throw new Error('No Linux AppImage, macOS bundle, or Windows installer found in release assets')
  }

  for (const name of hits.linux) await assertAppImage(join(root, name))
  for (const name of hits.win) await assertPe(join(root, name))
  for (const name of hits.mac) await assertZipOrDmg(join(root, name))

  return hits
}

async function main() {
  const [releaseDir] = process.argv.slice(2)
  if (!releaseDir) throw new Error('Usage: node scripts/verify-unsigned-github-release.mjs <release-dir>')
  const hits = await verifyUnsignedGithubRelease(releaseDir)
  console.log(`Verified unsigned release assets: ${JSON.stringify(hits)}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
