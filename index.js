const fs = require('fs')
const path = require('path')
const core = require('@actions/core');
const github = require('@actions/github');

const inbuiltBumpScripts = {
  versionFile: require('./bump-scripts/versionFile'),
  goCobra: require('./bump-scripts/goCobra'),
}
const defaultBumpScript = inbuiltBumpScripts.versionFile

run().catch(error => { core.setFailed(error.message) })

async function run() {
  const octokit = new github.GitHub(core.getInput('repo-token'))
  const newComponentLabel = core.getInput('new-component-label')
  const componentGlobs = reFromGlobstring(core.getInput('component-globs'))
  const bumpScriptName = core.getInput('bump-script')
  // TODO: Parse colors
  const labelColors = ['00a396', '66e0d7', 'f2fcfc']
  const bumpLabelFormat = parseTemplateString(core.getInput('bump-label-format'))
  const tagFormat = parseTemplateString(core.getInput('tag-format'))

  const jobs = []

  const pr = github.context.payload.pull_request
  const repoArgs = await getRepoArgs(octokit, pr)

  const labels = getLabels(pr)
  const repoAccessor = getRepoAccessor(octokit, repoArgs)
  const bumpScript = await findBumpScript(bumpScriptName, repoAccessor.fileActions)

  let newComponentVersions = {}
  if (componentGlobs && labels.includes(newComponentLabel)) {
    newComponentVersions = await newComponentsFromPR(octokit, pr, repoArgs, bumpScript, componentGlobs)
    jobs.push(createLabels(octokit, repoArgs, Object.keys(newComponentVersions), bumpLabelFormat, labelColors))
  }

  const bumps = findBumps(labels, bumpLabelFormat)
  const bumpedVersions = await performBumps(bumpScript, bumps)

  const versions = {...newComponentVersions, ...bumpedVersions}
  core.setOutput('bumped', JSON.stringify(versions))

  if (Object.keys(versions).length == 0) {
    return Promise.all(jobs)
  }

  const tags = tagsFromVersions(tagFormat, versions)
  jobs.push(gitCommitWithTags(octokit, pr.number, repoArgs, repoAccessor.changes, versions, tags))

  return Promise.all(jobs)
}

async function getRepoArgs(octokit, pr) {
  if (!pr.merged || pr.base.ref !== 'master') {
    throw new Error('This PR was not merged into master')
  }
  const repoArgs = {
    owner: pr.base.repo.owner.login,
    repo: pr.base.repo.name,
    ref: pr.merge_commit_sha,
  }

  core.debug(`Working with ${repoArgs.owner}/${repoArgs.repo} at ${repoArgs.ref}`)
  return repoArgs
}

function reFromGlobstring(glob) {
  if (glob == "") {
    return null
  }

  const escaped = glob.replace(/[^A-Za-z0-9_,*]/g, '\\$&');
  return new RegExp(`^${glob.replace(',', '|').replace('*', '([^/]*)')}`)
}

async function findBumpScript(bumpScriptName, fileActions) {
  if (bumpScriptName === "") {
    return defaultBumpScript(fileActions)
  }

  if (!inbuiltBumpScripts.hasOwnProperty(bumpScriptName)) {
    throw new Error(`No bump script named ${bumpScriptName}`)
  }

  core.debug(`Using bump script: ${bumpScriptName}`)
  const initBumpScript = inbuiltBumpScripts[bumpScriptName]
  return initBumpScript(fileActions)
}

function parseTemplateString(template) {
  return function(args) {
    return template.replace(/\$\{([^}]+)\}/g, function (match, variable) {
      if (args[variable] === undefined) {
        throw new Error(`No value for {${variable}} given in arguments`)
      }
      return args[variable]
    })
  }
}

function getLabels(pr) {
  return pr.labels.map((label) => label.name)
}

async function createLabels(octokit, repoArgs, componentNames, bumpLabelFormat, labelColors) {
  const labels = {
    major: labelColors[0],
    minor: labelColors[1],
    patch: labelColors[2],
  }

  let jobs = []
  for (const component of componentNames) {
    for (const bumpType in labels) {
      const job = octokit.issues.createLabel({
        ...repoArgs,
        name: bumpLabelFormat({component, bumpType}),
        color: labels[bumpType],
        description: `${bumpType} SemVer bump to \`${component}\``,
      });
    
      jobs.push(job)
    }
  }

  return Promise.all(jobs)
}

function findBumps(labels, bumpLabelFormat) {
  const checker = new RegExp(bumpLabelFormat({
    component: '(?<component>.+)',
    bumpType: '(?<bumpType>major|minor|patch)',
  }))

  let bumps = {}
  for (const label of labels) {
    const match = checker.exec(label)
    if (match === null) {
      continue
    }

    bumps[match.groups.component || ""] = match.groups.bumpType
  }

  return bumps
}

async function performBumps(bumpScript, bumps) {
  let bumpedVersions = {}

  let jobs = []
  for (const component in bumps) {
    const bumpType = bumps[component]
    const promise = bumpScript(bumpType, component).then(version => bumpedVersions[component] = version)
    jobs.push(promise)
  }

  return Promise.all(jobs).then(() => bumpedVersions) 
}

function getRepoAccessor(octokit, repoArgs) {
  const accessor = {
    changes: {},
    cache: {},
  }

  const getFile = async (filePath) => {
    if (accessor.cache.hasOwnProperty(filePath)) {
      return accessor.cache[filePath]
    }

    return octokit.repos.getContents({...repoArgs, path: filePath})
      .then(result => Buffer.from(result.data.content, 'base64').toString())
      .catch(e => {
        core.debug(`File not retrievable: ${filePath} (${e.message})`)
        return null
      })
      .then(data => accessor.cache[filePath] = data)
  }

  accessor.fileActions = {
    readFile: getFile,
    fileExists: async (file) => (await getFile(file) !== null),
    writeFile: async (file, data) => { accessor.changes[file] = data },
  }

  return accessor
}

function tagsFromVersions(tagFormat, versions) {
  let tags = []

  for (const component in versions) {
    const version = versions[component]
    tags.push(tagFormat({ component, version }))
  }

  core.debug(`Will be tagged with: ${tags.join(', ')}`)
  return tags
}

async function newComponentsFromPR(octokit, pr, repoArgs, bumpScript, re) {
  const newComponents = {}

  const jobs = []

  const per_page = 100
  for (let page = 0; page * per_page < pr.changed_files; page++) {
    const pageJob = octokit.pulls.listFiles({
      ...repoArgs,
      pull_number: pr.number,
      page, per_page,
    }).then(result => Promise.all(result.data.map((f) => {
      if (!['added', 'renamed'].includes(f.status)) {
        return
      }
      const match = re.exec(f.filename)
      if (match === null) {
        return
      }

      const component = match[1]
      return bumpScript('none', component).then(version => { newComponents[component] = version })
    })))

    jobs.push(pageJob)
  }

  return Promise.all(jobs).then(() => newComponents)
}

async function gitCommitWithTags(octokit, prNumber, repoArgs, changedFiles, versions, tags) {
  const type = 'blob'
  const mode = '100644' // TODO: Cappture executability -> 100755
  const tree = Object.keys(changedFiles).map((filePath) => ({ type, mode, path: filePath, content: changedFiles[filePath] }))

  const { owner, repo, ref: baseRef } = repoArgs

  const changeTree = await octokit.git.createTree({owner, repo, base_tree: baseRef, tree})
  const treeSha = changeTree.data.sha

  let message = `Bumping versions from #${prNumber}\n\nThese are the new version numbers:\n`
  for (let component in versions) {
    let name = component
    if (component === "") {
      name = '(whole repository)'
    }

    message += `- ${name}: ${versions[component]}\n`
  }

  core.debug(`Creating commit of tree (${treeSha}) atop master (${baseRef})`)
  const commit = await octokit.git.createCommit({ owner, repo, message, tree: treeSha, parents: [baseRef]})
  const newSha = commit.data.sha
  core.debug(`New commit with version bumps: ${newSha}`)

  const jobs = []
  for (const tag of tags) {
    core.debug(`Adding tag: ${tag}`)
    const job = octokit.git.createRef({ owner, repo, ref: `refs/tags/${tag}`, sha: newSha})
    jobs.push(job)
  }
  await Promise.all(jobs)
  core.debug('Tags added to commit, updaing master ref')

  return octokit.git.updateRef({owner, repo, ref: 'heads/master', sha: newSha})
}
