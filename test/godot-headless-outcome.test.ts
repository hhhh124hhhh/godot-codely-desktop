Warning: fs was declared with const; use let for reassignable variables.
import { expect, it } from 'vitest'
import { execGodotAsync } from '../packages/dsh-godot-stack/godot-stack/mcp/godot-mcp-server/src/better/src/godot/headless'

it('preserves completed failure versus uncertain timeout and process-start failure', async () => {
  const failed = await execGodotAsync(process.execPath, ['-e', 'console.error("INTENTIONAL_EXIT");process.exit(17)'])
  expect(failed).toMatchObject({ success: false, exitCode: 17, failureKind: 'EXIT_CODE' })
  expect(failed.stderr).toContain('INTENTIONAL_EXIT')
  const interrupted = await execGodotAsync(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeout: 100 })
  expect(interrupted).toMatchObject({ success: false, failureKind: 'INTERRUPTED' })
  const missing = await execGodotAsync(process.execPath + '.missing', ['--version'])
  expect(missing).toMatchObject({ success: false, failureKind: 'START_FAILED' })
})
