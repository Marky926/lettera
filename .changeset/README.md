# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets). It records
intent-to-release changes for the `@lettera/*` packages.

## Adding a changeset

When you make a change that should be released, run:

```bash
pnpm changeset
```

Select the affected packages and the semver bump (patch / minor / major), then write a short
summary. Commit the generated markdown file in this folder together with your change.

## Releasing

Releases are automated via GitHub Actions (`.github/workflows/release.yml`). When changesets are
merged into `main`, a "Version Packages" PR is opened that applies the version bumps and updates
changelogs. Merging that PR publishes the affected packages to npm.

To version and publish manually:

```bash
pnpm version-packages   # applies changesets, bumps versions, updates changelogs
pnpm release            # builds all packages and runs `changeset publish`
```
