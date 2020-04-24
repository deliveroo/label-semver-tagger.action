# Label SenVer Tagger

This action is useful when PRs with labels containing semantic versioning information have been merged. It will bump the version data appropriately, commit those changes to your `master` branch, and tag them with the appropriate (optionally component-prefixed) git tag.

The inputs for the action allow specifying how version information is stored in your repo, and what the tags should look like. The defaults are listed below in the example.

## Example

```yaml
on:
  pull_request:
    types: closed

jobs:
  tag:
    runs-on: ubuntu-latest
    steps:
      - name: Identify version bumps and tag the repo
        uses: deliveroo/label-semver-tagger.action@v1.0.0
        with:
          repo-token: "${{ secrets.GITHUB_TOKEN }}"
          bump-script: versionFile
          bump-label-format: ${bumpType}
          tag-format: v${version}
```

## Inputs

### `bump-script`

The name of one of the files in `bump-script`, scripts which define how the version file should be read and bumped in your repo. Read the comment at the top of the files to determine which one is right for you. The default, `versionFile`, holds the repo's version information in a file called `VERSION` in the root of your repo.

### `bump-label-format`

How the type of bump should be interpreted from the labels on merged PRs. The default, `${bumpType}`, will look for the labels named `major`, `minor` and `patch` to bump the repository's version appropriately. If you prefix or suffix those in your repo, you can add that here.

### `tag-format`

How the tags that will be applied to the versioning commit should be formatted. The default, `v${version}`, will create tags that look like `v1.0.0`.

## Config: Components

When your repo contains more than one releasable component, this action can be very useful. It provides additional options so that only the appropriate components are versioned on PRs that change them.

### `bump-label-format`

When bumping components this action will need a way to determine which component is being bumped. This input should now hold both a `${bumpType}` and a `${component}` template variable. A common value for this input is `${component}:${version}` which will look for labels like `supertool:major` and `supertool:patch`.

### `tag-format`

As above, when a component is bumped its likely you'll want that reflected in the git tag aswell. A common value for this input is `${component}/${bumpType}` which will tag your commits similarly to `supertool/1.0.0`.

### `new-component-label`

In a multi-component repo you may _add_ a component, and this action assists you by creating labels for your repo, and tagging with what ever version number you start with (ie. no increment) when it sees whatever label name you specify here. The default is `new component`.
