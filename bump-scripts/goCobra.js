// This bump script will process incoming component bumpTypes, updating the cobra
// config at `cmd/<component>/cmd/root.go` to bump the relevant part of the SemVer
// stored on the `Version: "x.y.z"` line.
// It will throw an error if a bump label without a component was merged.
// It will throw an error if the specified component doesn't exist.
const path = require('path')

const versionRe = /\bVersion:\s*"((?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+))",/

module.exports = ({fileExists, readFile, writeFile}) => {
  return async (bumpType, component) => {
    if (component === null) {
        throw new Error('This bump script requires component names.')
    }

    const rootCmdPath = path.join('cmd', component, 'cmd', 'root.go')
    const doesExist = await fileExists(rootCmdPath)
    if (!doesExist) {
      throw new Error(`There is no component named '${component}'`)
    }

    const data = await readFile(rootCmdPath)

    const match = versionRe.exec(data)
    if (match === null) {
      throw new Error(`Version information is missing from ${rootCmdPath}`)
    }

    if (bumpType === 'none') {
      return match[1]
    }

    let {major, minor, patch} = match.groups;

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
    const newData = data.replace(versionRe, (original, oldVersion) => original.replace(oldVersion, newVersion))

    await writeFile(rootCmdPath, newData)

    return newVersion
  }
}