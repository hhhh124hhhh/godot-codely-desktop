const fs = require('node:fs')
const path = require('node:path')
const asar = require('@electron/asar')

/** Fail a game-product package if a stale Office/PPT payload slipped into it. */
module.exports = function verifyGameScope(resourcesDir) {
  if (fs.existsSync(path.join(resourcesDir, 'office-runtime'))) throw new Error('Game product must not ship the suspended Office Python payload')
  const forbidden = /(?:^|\/)node_modules\/(?:dsh-desktop-office|dsh-ppt(?:-composer)?|@deepseek-ai\/(?:dsh-skill-office|dsh-office-to-pdf|libreoffice-kit(?:-[^/]+)?))(?:\/|$)/u
  const found = asar.listPackage(path.join(resourcesDir, 'app.asar')).find(entry => forbidden.test(entry.replaceAll('\\', '/')))
  if (found) throw new Error('Game product contains a suspended Office/PPT package: ' + found)
}
