const path = require('node:path')
const verifyPackagedPptRuntime = require('./verify-packaged-ppt-runtime.cjs')
const verifyPackagedGodotRuntime = require('./verify-packaged-godot-runtime.cjs')
const { afterPack: verifyOfficeRuntime } = require('./verify-office-runtime.cjs')
const { verifyAsarUnpack } = require('./verify-asar-unpack.cjs')

/** electron-builder afterPack: package-content gates run before signing. */
module.exports = async function afterPack(context) {
  const product = context.packager.appInfo.productFilename
  const resourcesDir = context.electronPlatformName === 'darwin' || context.electronPlatformName === 'mas'
    ? path.join(context.appOutDir, `${product}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources')
  verifyAsarUnpack(resourcesDir)
  await verifyPackagedGodotRuntime(context)
  await verifyPackagedPptRuntime(context)
  if (context.electronPlatformName !== 'linux') {
    await verifyOfficeRuntime(context)
  }
}
