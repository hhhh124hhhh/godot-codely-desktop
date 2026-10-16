const { readFile } = require('node:fs/promises')
const path = require('node:path')
const asar = require('@electron/asar')

/** Reject stale app resources even when the build itself succeeded. */
async function verifyPackagedBrand(resourcesDir, projectRoot) {
  const generated = path.join(projectRoot, '.build', 'brand-assets')
  const archive = path.join(resourcesDir, 'app.asar')
  const images = [
    ['icon.png', 'dsh-desktop-logo.png'],
    ['logo-light.png', 'dsh-desktop-logo-light.png'],
    ['logo-dark.png', 'dsh-desktop-logo-dark.png']
  ]
  for (const [source, destination] of images) {
    const expected = await readFile(path.join(generated, source))
    const actual = asar.extractFile(archive, path.join('node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', destination))
    if (!actual.equals(expected)) throw new Error(`Packaged brand asset is stale: ${destination}`)
    if (source === 'icon.png' && !(await readFile(path.join(resourcesDir, 'icon.png'))).equals(expected)) {
      throw new Error('Packaged window/import icon is stale: resources/icon.png')
    }
  }
  console.log('Packaged window/import and client brand images match this build')
}

module.exports = { verifyPackagedBrand }
