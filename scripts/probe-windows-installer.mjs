import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertWindowsExecutable } from './windows-directory-installer.mjs'

if (process.platform !== 'win32') throw new Error('Installer behavior probes require Windows')
const outputDirectory = process.argv[2]
if (!outputDirectory) throw new Error('Usage: node scripts/probe-windows-installer.mjs <package-output-directory>')

const require = createRequire(import.meta.url)
const { getMakeNsisPath } = require('app-builder-lib/out/toolsets/windows.js')
const { build } = require('../package.json')
const makeNsis = await getMakeNsisPath(build.toolsets?.nsis, build.nsis?.customNsisBinary)
const sevenZip = resolve(outputDirectory, '.nsis-directory-installer', '7za.exe')
assertWindowsExecutable(await readFile(sevenZip))
const scripts = fileURLToPath(new URL('.', import.meta.url))

for (const [script, extraArguments] of [
  ['probe-installer-permission-failure.ps1', []],
  ['probe-installer-spaced-path.ps1', ['-SevenZip', sevenZip]]
]) {
  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(scripts, script),
    '-MakeNsis', makeNsis.path, ...extraArguments
  ], { stdio: 'inherit', env: { ...process.env, ...makeNsis.env } })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${script} failed (exit ${result.status}, signal ${result.signal})`)
}
