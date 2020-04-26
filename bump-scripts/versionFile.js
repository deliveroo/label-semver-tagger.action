// This bump script will process the `major`, `minor`, and `patch` labels
// updating or creating the `/VERSION` file of your repo by one point in the
// relevant part of the SemVer contained.
// It will throw an error if a `component/bumpType` label was merged.
// It will throw an error if the `/VERSION` file doesn't contain a valid Semantic Version

const versionFile = 'VERSION'
const core = require('@actions/core');

module.exports = ({fileExists, readFile, writeFile}) => {
  return (bumpType, component) => {
    if (component !== "") {
      throw 'This bump script does not work with labels containing component names.'
    }

    let oldVersion
    if (fileExists(versionFile)) {
      oldVersion = readFile(versionFile)
    } else {
      oldVersion = '0.0.0'
    }

    if (bumpType === 'none') {
      return { "": oldVersion }
    }

    core.debug(`Version is: ${oldVersion}`)
    let [major, minor, patch] = oldVersion.split(".")
    switch(bumpType) {
      case 'major':
        major++
        minor = 0
        patch = 0
        break
      case 'minor':
        minor++
        patch = 0
        break
      case 'patch':
        patch++
        break
      default:
        throw new Error(`Unknown bump type "${bumpType}"`)
    }

    const newVersion = `${major}.${minor}.${patch}`
    writeFile(versionFile, newVersion)
    return newVersion
  }
}