const path = require('node:path')
const { verifyPackagedBrand } = require('./verify-packaged-brand.cjs')
const verifyPackagedGodotRuntime = require('./verify-packaged-godot-runtime.cjs')
const { verifyAsarUnpack } = require('./verify-asar-unpack.cjs')
const verifyGameScope = require('./verify-game-scope.cjs')

/** electron-builder afterPack: package-content gates run before signing. */
module.exports = async function afterPack(context) {
  const product = context.packager.appInfo.productFilename
  const resourcesDir = context.electronPlatformName === 'darwin' || context.electronPlatformName === 'mas'
    ? path.join(context.appOutDir, `${product}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources')
  verifyAsarUnpack(resourcesDir)
  verifyGameScope(resourcesDir)
  await verifyPackagedBrand(resourcesDir, context.packager.projectDir)
  await verifyPackagedGodotRuntime(context)
}
