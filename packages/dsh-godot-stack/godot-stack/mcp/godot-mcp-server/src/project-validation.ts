import { mkdtemp, readdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execGodotAsync } from './better/src/godot/headless.js'

/** Load on-disk scripts and scenes, then boot the game. Neither phase proves gameplay correctness. */
export async function validateProject(godotPath: string, projectPath: string, frames = 60) {
  const resources: string[] = []
  async function walk(directory: string, prefix: string) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (item.name.startsWith('.') || item.name === 'node_modules' || item.isSymbolicLink()) continue
      if (item.isDirectory()) await walk(join(directory, item.name), prefix + item.name + '/')
      else if (/\.(gd|tscn)$/.test(item.name)) resources.push(prefix + item.name)
      if (resources.length > 5000) throw new Error('Project validation resource limit exceeded')
    }
  }
  await walk(projectPath, 'res://')
  const scratch = await mkdtemp(join(tmpdir(), 'godot-compile-'))
  try {
    const script = join(scratch, 'validate.gd')
    await writeFile(script, `extends SceneTree\nfunc _initialize() -> void:\n\tvar failed := false\n\tfor path in ${JSON.stringify(resources)}:\n\t\tvar resource = load(path)\n\t\tif resource == null or (resource is GDScript and not resource.can_instantiate()) or (resource is PackedScene and not resource.can_instantiate()):\n\t\t\tprinterr("VALIDATION_FAILED: ", path)\n\t\t\tfailed = true\n\tprint("VALIDATION_COMPLETE resources=", ${resources.length})\n\tquit(1 if failed else 0)\n`)
    const compile = await execGodotAsync(godotPath, ['--headless', '--path', projectPath, '--script', script], { cwd: projectPath, timeout: 30000 })
    const hasErrors = (result: { stdout: string; stderr: string }) => /SCRIPT ERROR:|Parse Error:|ERROR:|VALIDATION_FAILED:/.test(result.stdout + '\n' + result.stderr)
    if (!compile.success || hasErrors(compile)) return { ok: false, phase: 'compile', resources: resources.length, ...compile }
    const smoke = await execGodotAsync(godotPath, ['--headless', '--path', projectPath, '--quit-after', String(frames)], { cwd: projectPath, timeout: 30000 })
    return { ok: smoke.success && !hasErrors(smoke), phase: 'smoke', resources: resources.length, compile, smoke }
  } finally { await rm(scratch, { recursive: true, force: true }) }
}
