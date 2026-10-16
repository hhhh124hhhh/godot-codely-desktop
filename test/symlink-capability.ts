import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function probeFileSymlinks(): Promise<boolean> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-file-symlink-probe-')))
  try {
    const target = join(root, 'target')
    await writeFile(target, 'probe')
    try { await symlink(target, join(root, 'link'), 'file'); return true }
    catch (error) {
      if (process.platform === 'win32' && error instanceof Error && 'code' in error &&
        ['EPERM', 'EACCES', 'ENOTSUP'].includes(String(error.code))) return false
      throw error
    }
  } finally { await rm(root, { recursive: true, force: true }) }
}

// Directory junctions need no Developer Mode. Only actual file-symlink cases
// depend on this capability; unrelated assertions must continue to run.
export const supportsFileSymlinks = await probeFileSymlinks()
