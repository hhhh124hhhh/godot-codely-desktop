/** Generate the Godot plugin with a self-contained MCP executable, without boot-time npm. */
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { builtinModules } from 'node:module'
import { build } from 'esbuild'
import { replaceInstalledPackages } from './ppt-package-projection.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'packages/dsh-godot-stack')
const output = path.join(root, '.build/godot-runtime/packages/dsh-godot-stack')
const server = path.join(source, 'godot-stack/mcp/godot-mcp-server')

await fs.rm(output, { recursive: true, force: true })
await fs.cp(source, output, {
  recursive: true,
  filter: candidate => {
    const name = path.basename(candidate)
    return !['node_modules', '.git', 'build', 'build-verified', 'runtime', 'coverage'].includes(name)
      && !(name.startsWith('.env') && name !== '.env.example')
      && !name.endsWith('.config.json')
  },
})
const runtime = path.join(output, 'godot-stack/mcp/godot-mcp-server/runtime')
// Override the source-only .gitignore: its unanchored build/ would also hide runtime/build in npm pack.
await fs.writeFile(path.join(path.dirname(runtime), '.npmignore'), 'node_modules/\n/build/\n.env\n.env.*\n*.config.json\n')
await fs.mkdir(path.join(runtime, 'build'), { recursive: true })
const bundled = await build({
  entryPoints: [path.join(server, 'src/index.ts')],
  outfile: path.join(runtime, 'build/index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  metafile: true,
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  plugins: [{
    name: 'preserve-image-config-location',
    setup(builder) {
      // Use the public ESM exports, resolved beside this script against the root lockfile.
      builder.onResolve({ filter: /^@modelcontextprotocol\/sdk\// }, ({ path: specifier }) => ({
        path: fileURLToPath(import.meta.resolve(specifier)),
      }))
      builder.onLoad({ filter: /[/\\]image-gen[/\\]image-gen\.ts$/ }, async ({ path: filename }) => ({
        contents: (await fs.readFile(filename, 'utf8')).replace('fileURLToPath(import.meta.url)', "fileURLToPath(new URL('./image-gen/image-gen.js', import.meta.url))"),
        loader: 'ts',
        resolveDir: path.dirname(filename),
      }))
    },
  }],
})
const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, '')))
for (const emitted of Object.values(bundled.metafile.outputs)) {
  for (const imported of emitted.imports) {
    if (imported.external && !builtins.has(imported.path.replace(/^node:/, ''))) {
      throw Error(`Godot MCP has an unbundled dependency: ${imported.path}`)
    }
  }
}
// Preserve license texts for dependency code embedded in the executable.
const packages = new Set()
for (const input of Object.keys(bundled.metafile.inputs)) {
  if (!input.replaceAll('\\', '/').includes('node_modules/')) continue
  let directory = path.dirname(path.resolve(root, input))
  while (directory !== path.dirname(directory)) {
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'))
      if (manifest.name) { packages.add(directory); break }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    directory = path.dirname(directory)
  }
}
for (const directory of [...packages].sort()) {
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'))
  const destination = path.join(runtime, 'licenses', manifest.name.replaceAll('/', '__'))
  await fs.mkdir(destination, { recursive: true })
  await fs.writeFile(path.join(destination, 'attribution.json'), JSON.stringify({ name: manifest.name, version: manifest.version, license: manifest.license }, null, 2) + '\n')
  for (const file of await fs.readdir(directory)) {
    if (/^(licen[sc]e|notice|copying)(\.|$)/i.test(file) && (await fs.stat(path.join(directory, file))).isFile()) {
      await fs.copyFile(path.join(directory, file), path.join(destination, file + '.txt'))
    }
  }
}
await fs.cp(path.join(server, 'src/godot-scripts'), path.join(runtime, 'src/godot-scripts'), { recursive: true })
// Godot 技能分发：把包内 skills 打进 runtime，供 provisioning 平铺复制到用户技能根（user-dsh root）。
await fs.cp(path.join(source, 'skills'), path.join(runtime, 'skills'), { recursive: true })
await fs.writeFile(path.join(runtime, 'package.json'), JSON.stringify({ type: 'module', private: true }) + '\n')
for (const license of ['LICENSE.md', 'LICENSE-apache.md', 'NOTICE']) {
  await fs.copyFile(path.join(server, license), path.join(runtime, license + '.txt'))
}
const files = ['build/index.js', 'src/godot-scripts/godot_operations.gd', 'package.json']
const hashes = {}
for (const file of files) hashes[file] = createHash('sha256').update(await fs.readFile(path.join(runtime, file))).digest('hex')
await fs.writeFile(path.join(runtime, 'runtime-manifest.json'), JSON.stringify({ format: 1, files: hashes }, null, 2) + '\n')
if (!process.argv.includes('--no-project')) {
  // Replace the npm file: junction itself, never its maintained source directory.
  await replaceInstalledPackages([{ packageName: 'dsh-godot-stack', source: output }], { nodeModulesRoot: path.join(root, 'node_modules') })
}
console.log(`Godot runtime generated: ${path.relative(root, output)}`)
