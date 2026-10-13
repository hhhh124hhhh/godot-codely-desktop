/** Provision only the generated dependency bundle; preserve user server configuration and dependencies. */
import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
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
  // ── Godot 技能分发：runtime 内 skills 平铺复制到 <home>/skills（user-dsh root，rank 400）。
  // 一级 bundle（godot-memory/godot-web-access）与二级领域（godot/ 下 8 项）都平铺为 <name>/SKILL.md；
  // 已存在的同名技能目录视为用户版本，保留不覆盖。技能不进 runtime-manifest（内容迭代不破坏完整性）。
  const skillsSource = join(source, 'skills')
  if (existsSync(skillsSource)) {
    const skillsTarget = join(home, 'skills')
    await mkdir(skillsTarget, { recursive: true })
    const copySkill = async (from, name) => {
      const dest = join(skillsTarget, name)
      if (existsSync(dest)) return
      await cp(from, dest, { recursive: true })
    }
    for (const entry of await readdir(skillsSource, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(skillsSource, entry.name)
      const subs = await readdir(dir, { withFileTypes: true })
      const childDirs = subs.filter((item) => item.isDirectory())
      if (childDirs.length === 0) {
        // 纯 bundle（godot-memory / godot-web-access）：直接平铺
        if (existsSync(join(dir, 'SKILL.md'))) await copySkill(dir, entry.name)
      } else {
        // 容器（godot/ 含索引+子领域）：子领域平铺，容器本身（索引）不复制
        for (const sub of childDirs) {
          if (!existsSync(join(dir, sub.name, 'SKILL.md'))) continue
          await copySkill(join(dir, sub.name), sub.name)
        }
      }
    }
  }
  return { status: 'configured' }
}
