import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AclSandbox, tempWriteSid, workspaceWriteSid } from '@deepseek-ai/dsh-sandbox-windows-acl'
import { resolvePwshPath } from '@deepseek-ai/dsh-pwsh-local'

const isWin32 = process.platform === 'win32'

describe.skipIf(!isWin32)('Windows workspace-write ACL self-heal', () => {
  const scratchRoots = []

  afterEach(() => {
    for (const root of scratchRoots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('recovers an owner-owned Modify-only workspace and keeps writes confined', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-acl-self-heal-'))
    scratchRoots.push(root)
    const workspace = join(root, 'workspace')
    const tempDir = join(root, 'temp')
    mkdirSync(workspace)
    mkdirSync(tempDir)

    // Match the default data-volume ACL that triggers Win32 5: the workspace
    // owner can edit its DACL, but Authenticated Users has no WRITE_OWNER.
    const acl = spawnSync('icacls', [
      workspace,
      '/inheritance:r',
      '/grant', '*S-1-5-11:(OI)(CI)(M)',
      '/grant', '*S-1-5-18:(OI)(CI)(F)',
    ], { encoding: 'utf8' })
    expect(acl.status, `icacls failed: ${acl.stderr}`).toBe(0)

    const insideFile = join(workspace, 'inside.txt')
    const outsideFile = join(root, 'outside.txt')
    const sandbox = new AclSandbox({
      writableDirs: [workspace],
      tempDir,
      writeSid: workspaceWriteSid(workspace),
      tempWriteSid: tempWriteSid(tempDir),
      mode: 'workspace-write',
    })

    try {
      await sandbox.init()
      const command = `$ErrorActionPreference='Stop'; Set-Content -LiteralPath '${insideFile}' -Value inside; try { Set-Content -LiteralPath '${outsideFile}' -Value outside -ErrorAction Stop } catch {}; exit 0`
      const result = await sandbox.spawn({
        command: resolvePwshPath(),
        args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
        cwd: workspace,
      }).wait()
      expect(result.exitCode, `stdout=${result.stdout?.toString?.()} stderr=${result.stderr?.toString?.()}`).toBe(0)
      expect(existsSync(insideFile), `exit=${result.exitCode} stdout=${result.stdout?.toString?.()} stderr=${result.stderr?.toString?.()}`).toBe(true)
      expect(existsSync(outsideFile)).toBe(false)
    } finally {
      sandbox.dispose()
    }
  })
})

