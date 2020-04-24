# Label Tagger

This action can be used when PRs with labels containing semantic versioning information have been merged. It will bump the version data appropriately, commit those changes to your `master` branch, and tag them with the appropriate (optionally component-prefixed) git tag.

```yaml
on:
  pull_request:
    types: closed

jobs:
  tag:
    runs-on: ubuntu-latest
    steps:
      - name: Identify version bumps and tag the repo
        uses: deliveroo/label-semver-tagger.action@v1
        with:
          repo-token: "${{ secrets.GITHUB_TOKEN }}"
```

# Config

## `bump-script`

If `bump-script` points to an `import`able JS file, it will be called to bump (or retrieve) the version number(s) in your repo. Strings starting with `./` will be pulled from your repo, others will be looked for in the `bump-scripts` directory of this action.

Your script must export a function of the form `(bumpType: string, component: string | null) => (newVersion: string)`. It will be called when PRs are merged with labels that are either of the form `[component]/[bumpType]`, or `[bumpType]` (if so, the `component` argument will be `null`).

`bumpType` will always be one of `major`, `minor`, `patch`, or `none`. When `bumpType` is `none` then the script should only return the current version number, otherwise it should also alter the filesystem to bump the relevant part of the version number.

The script will be called from the root of your repo.
