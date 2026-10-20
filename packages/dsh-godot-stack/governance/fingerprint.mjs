Warning: fs was declared with const; use let for reassignable variables.
import { createHash } from 'node:crypto'
import { readdir, open, realpath, lstat } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'
import { fail } from './contract.mjs'

export const digest = value => createHash('sha256').update(value).digest('hex')

/** Conservative input closure: all regular files except Git and Godot's generated cache.
 * Linked resources and oversized projects fail closed instead of pretending to cover them.
 * @param {string} root
 */
export async function fingerprintProject(root) {
  const canonical = await realpath(root)
  const files = []
  let bytes = 0
  let visited = 0
  async function walk(directory, prefix = '', depth = 0) {
    if (depth > 128) fail('PROJECT_TOO_LARGE', 'witness input nesting limit exceeded')
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    for (const entry of entries) {
      if (['.godot', '.git'].includes(entry.name)) continue
      if (++visited > 20000) fail('PROJECT_TOO_LARGE', 'witness input entry limit exceeded')
      const name = prefix + entry.name
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) fail('UNSUPPORTED_INPUT_LINK', 'linked project inputs require a separate evidence adapter')
      const physical = await realpath(path)
      const local = relative(canonical, physical)
      if ((await lstat(path)).isSymbolicLink() || local === '..' || local.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) || isAbsolute(local)) fail('UNSUPPORTED_INPUT_LINK', 'input resolution changed or escaped the project')
      if (entry.isDirectory()) await walk(path, name + '/', depth + 1)
      else if (entry.isFile()) {
        if (files.length >= 10000) fail('PROJECT_TOO_LARGE', 'witness input file limit exceeded')
        const file = await open(path, 'r')
        try {
          const before = await file.stat()
          bytes += before.size
          if (bytes > 100 * 1024 * 1024) fail('PROJECT_TOO_LARGE', 'witness input byte limit exceeded')
          const content = await file.readFile()
          const after = await file.stat()
          if (before.size !== content.length || before.size !== after.size || before.mtimeMs !== after.mtimeMs || await realpath(path) !== physical) fail('INPUT_CHANGED', 'project changed during fingerprinting')
          files.push({ path: name, sha256: digest(content) })
        } finally { await file.close() }
      } else fail('UNSUPPORTED_INPUT_LINK', 'non-regular project input')
    }
  }
  await walk(canonical)
  return { fingerprint: digest(JSON.stringify(files)), files }
}
