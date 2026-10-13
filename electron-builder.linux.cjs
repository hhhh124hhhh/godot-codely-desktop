const packageJson = require('./package.json')

/** Linux community builds omit the macOS/Windows Office Python payload. */
module.exports = {
  ...packageJson.build,
  extraResources: packageJson.build.extraResources.filter((entry) => {
    const from = typeof entry === 'object' ? entry.from : entry
    return from !== '.build/office-runtime'
  })
}
