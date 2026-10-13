/** Godot Codely data locations. Upstream DSH uses ~/.dsh and the dsh-desktop app-data folder; this fork does not. */
import { homedir } from 'node:os'
import { join } from 'node:path'

export const CLI_HOME_DIR = '.godot-codely'
export const DESKTOP_USER_DATA_DIR = 'godot-codely'
export const DESKTOP_DEV_USER_DATA_DIR = 'godot-codely-dev'
const LAUNCH_TOKEN = 'godot-codely-launch-token'

export function cliHome(env = process.env, home = homedir()) {
  const fromEnv = env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv
  return join(home, CLI_HOME_DIR)
}

export function memoryDirectory(env = process.env, home = homedir()) {
  if (env.GODOT_CODELY_MEMORY_DIR) return env.GODOT_CODELY_MEMORY_DIR
  return join(home, CLI_HOME_DIR, 'memories')
}

function desktopAppData(env, home) {
  if (process.platform === 'win32') return env.APPDATA || join(home, 'AppData', 'Roaming')
  if (process.platform === 'darwin') return join(home, 'Library', 'Application Support')
  return env.XDG_CONFIG_HOME || join(home, '.config')
}

export function desktopTokenFiles(env = process.env, home = homedir()) {
  const base = desktopAppData(env, home)
  return [DESKTOP_USER_DATA_DIR, DESKTOP_DEV_USER_DATA_DIR].map((name) =>
    join(base, name, 'harness', LAUNCH_TOKEN)
  )
}

export function tokenCandidatePaths(env = process.env, home = homedir()) {
  const paths = []
  if (env.GODOT_CODELY_TOKEN_FILE) paths.push(env.GODOT_CODELY_TOKEN_FILE)
  if (typeof env.DSH_HOME === 'string' && env.DSH_HOME.trim()) paths.push(join(env.DSH_HOME, LAUNCH_TOKEN))
  paths.push(...desktopTokenFiles(env, home))
  const cliToken = join(cliHome(env, home), LAUNCH_TOKEN)
  if (!paths.includes(cliToken)) paths.push(cliToken)
  return paths
}
