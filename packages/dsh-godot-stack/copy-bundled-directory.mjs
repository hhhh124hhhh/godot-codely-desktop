import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Copy host-owned bundle files using Electron's ASAR-aware fs operations.
 * fs.cp uses native directory traversal which cannot read ASAR directories.
 * @param {string} source
 * @param {string} target
 */
export async function copyBundledDirectory(source, target) {
  await mkdir(target, { recursive: true })
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    if (entry.isDirectory()) await copyBundledDirectory(from, to)
    else if (entry.isFile()) await writeFile(to, await readFile(from))
    else throw Error(`Unsupported bundled entry: ${from}`)
  }
}
