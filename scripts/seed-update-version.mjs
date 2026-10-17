/** Lower only a disposable installed copy's package version; preserve its shipped code/layout. */
import { readFile, open } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const asar = createRequire(import.meta.url)('@electron/asar')
const hash = value => createHash('sha256').update(value).digest('hex')

export async function seedUpdateVersion(archive, expected, seed) {
  assert.match(expected, /^\d+\.\d+\.\d+$/)
  assert.match(seed, /^\d+\.\d+\.\d+$/)
  assert.equal(seed.length, expected.length, 'Fixture version must preserve manifest size')
  const bytes = await readFile(archive)
  const { header, headerString, headerSize } = asar.getRawHeader(archive)
  const entry = header.files['package.json']
  assert.ok(entry && !entry.unpacked && entry.integrity?.algorithm === 'SHA256')
  const offset = 8 + headerSize + Number(entry.offset)
  const original = bytes.subarray(offset, offset + entry.size)
  const manifest = JSON.parse(original.toString())
  assert.equal(manifest.version, expected)
  const text = original.toString().replace(/("version"\s*:\s*")[^"]+("\s*[,}])/, (_match, before, after) => before + seed + after)
  const changed = Buffer.from(text)
  assert.equal(JSON.parse(text).version, seed)
  assert.equal(changed.length, original.length)
  entry.integrity.hash = hash(changed)
  assert.ok(Number.isSafeInteger(entry.integrity.blockSize) && entry.integrity.blockSize > 0)
  entry.integrity.blocks = []
  for (let index = 0; index < changed.length; index += entry.integrity.blockSize) entry.integrity.blocks.push(hash(changed.subarray(index, index + entry.integrity.blockSize)))
  const encodedHeader = Buffer.from(JSON.stringify(header))
  assert.equal(encodedHeader.length, Buffer.byteLength(headerString))
  const headerOffset = bytes.indexOf(Buffer.from(headerString), 8)
  assert.equal(headerOffset, 16, 'Pinned ASAR header encoding must match')
  const file = await open(archive, 'r+')
  try {
    await file.write(changed, 0, changed.length, offset)
    await file.write(encodedHeader, 0, encodedHeader.length, headerOffset)
    await file.sync()
  } finally { await file.close() }
  asar.uncache(archive)
  assert.equal(JSON.parse(asar.extractFile(archive, 'package.json')).version, seed)
  return { shippedVersion: expected, fixtureVersion: seed, shippedAsarSha256: hash(bytes), fixtureAsarSha256: hash(await readFile(archive)), changed: 'package.json version and its ASAR integrity hashes only' }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Installed-copy mutation is CI only')
  assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted', 'Disposable hosted runner required')
  console.log(JSON.stringify(await seedUpdateVersion(...process.argv.slice(2))))
}
