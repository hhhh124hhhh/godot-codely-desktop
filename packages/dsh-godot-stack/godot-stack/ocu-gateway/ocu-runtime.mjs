import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

export const OCU_VERSION = '1.0.0'

/** @param {NodeJS.ProcessEnv} [env] */
export function ocuHome(env = process.env) {
  return env.DSH_HOME || join(homedir(), '.dsh')
}

// Resolve from our managed runtime, never from the caller's cwd or another app's sandbox.
/** @param {string[]} args @param {NodeJS.ProcessEnv} [env] */
export async function resolveOcuCommand(args, env = process.env) {
  const explicit = args[0] === '--' ? args.slice(1) : args
  if (explicit.length) {
    if (process.platform === 'win32' && /\.(cmd|bat|ps1)$/i.test(explicit[0])) {
      throw new Error('Windows npm shim is unsupported; pass node.exe and the OCU bin/ocu script as separate arguments')
    }
    return { command: explicit[0], args: explicit.slice(1) }
  }
  const root = join(ocuHome(env), '.godot', 'ocu-runtime', 'node_modules', 'open-computer-use')
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  if (manifest.name !== 'open-computer-use' || manifest.version !== OCU_VERSION) {
    throw new Error(`expected open-computer-use@${OCU_VERSION} in ${root}; run setup-ocu.mjs`)
  }
  const launcher = join(root, 'bin', 'ocu')
  await access(launcher)
  return { command: process.execPath, args: [launcher, 'mcp'] }
}

/** @param {string} home Absolute DSH home belonging to the current host/profile. */
export async function provisionOcuGateway(home) {
  const source = dirname(fileURLToPath(import.meta.url))
  const target = join(home, '.godot', 'ocu-gateway')
  await mkdir(target, { recursive: true })
  for (const name of ['ocu-gateway.js', 'ocu-runtime.mjs']) {
    await cp(join(source, name), join(target, name))
  }
  // The gateway is outside the plugin's package scope after provisioning.
  await writeFile(join(target, 'package.json'), '{"private":true,"type":"module"}\n')
  return join(target, 'ocu-gateway.js')
}
