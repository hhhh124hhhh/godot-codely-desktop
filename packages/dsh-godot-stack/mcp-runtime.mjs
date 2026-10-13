/** Provision only the generated dependency bundle; preserve user server configuration and dependencies. */
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

async function validateRuntime(root) {
  const manifest = JSON.parse(await readFile(join(root, 'runtime-manifest.json'), 'utf8'))
  if (manifest.format !== 1 || !manifest.files || typeof manifest.files !== 'object') throw Error('invalid Godot runtime manifest')
  const expected = ['build/index.js', 'src/godot-scripts/godot_operations.gd', 'package.json']
  for (const file of expected) {
    const digest = createHash('sha256').update(await readFile(join(root, file))).digest('hex')
    if (manifest.files[file] !== digest) throw Error(`Godot runtime integrity failed: ${file}`)
  }
  return manifest
}

/** Missing or stale artifacts fail before MCP registration; never install dependencies during Harness boot. */
export async function provisionMcpRuntime(source, home, target) {
  const manifest = await validateRuntime(source)
  let current
  try {
    current = await validateRuntime(target)
  } catch {
    // A missing/old managed bundle is repaired from validated build output. User files remain untouched.
  }
  if (JSON.stringify(current) !== JSON.stringify(manifest)) {
    await mkdir(target, { recursive: true })
    await cp(source, target, { recursive: true, force: true })
    await validateRuntime(target)
  }
  const settingsPath = join(home, 'settings.json')
  let settings = {}
  try {
    settings = JSON.parse(await readFile(settingsPath, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw Error('invalid settings.json object')
  settings.mcpServers ??= {}
  if (!settings.mcpServers || typeof settings.mcpServers !== 'object' || Array.isArray(settings.mcpServers)) throw Error('invalid mcpServers object')
  if (!settings.mcpServers.godot) {
    settings.mcpServers.godot = {
      command: process.execPath,
      args: [join(target, 'build/index.js')],
      env: { DSH_HOME: home, ELECTRON_RUN_AS_NODE: '1' },
    }
    await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8')
  }
  return { status: 'configured' }
}
