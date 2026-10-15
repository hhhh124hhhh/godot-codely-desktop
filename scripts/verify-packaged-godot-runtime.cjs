const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

async function verifyRuntime(appRoot) {
  const root = path.join(appRoot, 'node_modules/dsh-godot-stack')
  const home = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'godot-packaged-'))
  try {
    const { provisionGodotPresets } = await import(pathToFileURL(path.join(root, 'index.js')).href)
    const { provisionMcpRuntime } = await import(pathToFileURL(path.join(root, 'mcp-runtime.mjs')).href)
    await provisionGodotPresets(home)
    for (const name of ['godot-codely-lite', 'godot-scene-expert', 'godot-shader-expert', 'godot-gdscript-expert']) {
      const content = await fs.readFile(path.join(home, '.agent-presets', name, 'agent.cordis.yml'), 'utf8')
      if (!content.includes('mcp-agent.mjs')) throw Error('Packaged preset is not bound to its host: ' + name)
    }
    const target = path.join(home, '.godot/mcp-server')
    await provisionMcpRuntime(path.join(root, 'godot-stack/mcp/godot-mcp-server/runtime'), home, target)
    for (const name of ['gdscript', 'scene-tree', 'godot-memory', 'godot-web-access']) {
      await fs.access(path.join(home, 'skills', name, 'SKILL.md'))
    }
    await fs.access(path.join(target, 'build/index.js'))
    console.log('Packaged Godot presets, MCP integrity and skills provisioning passed')
  } finally {
    await fs.rm(home, { recursive: true, force: true })
  }
}

module.exports = async function verifyPackagedGodotRuntime(context) {
  const product = context.packager.appInfo.productFilename
  const macContents = path.join(context.appOutDir, product + '.app', 'Contents')
  const windows = context.electronPlatformName === 'win32'
  const linux = context.electronPlatformName === 'linux'
  const resources = windows || linux ? path.join(context.appOutDir, 'resources') : path.join(macContents, 'Resources')
  const executable = windows ? path.join(context.appOutDir, product + '.exe')
    : linux ? path.join(context.appOutDir, context.packager.config.linux?.executableName ?? 'godot-codely')
    : path.join(macContents, 'Frameworks', product + ' Helper.app', 'Contents', 'MacOS', product + ' Helper')
  await promisify(execFile)(executable, [__filename, '--verify-runtime', path.join(resources, 'app.asar')], {
    cwd: resources,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    timeout: 120000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  })
}

if (require.main === module && process.argv[2] === '--verify-runtime') {
  verifyRuntime(path.resolve(process.argv[3])).catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
