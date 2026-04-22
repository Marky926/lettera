# Contributing to Lettera

Thanks for your interest! This guide covers the workflow expected for
all contributions, internal and external.

## Branching model

- `main` is the release branch. Always green, always deployable.
- `develop` is the integration branch. PRs target `develop`.
- Feature branches: `feat/<short-slug>`, fixes: `fix/<short-slug>`,
  chores: `chore/<short-slug>`.
- Releases are cut by merging `develop` → `main` with a tagged commit
  `vX.Y.Z` and an updated `CHANGELOG.md` entry.

## Local setup

Requirements: Node 20.12+, pnpm 10+, Docker (optional, for Postgres + API).

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

See [docs/getting-started.md](docs/getting-started.md) for the full
walk-through and [docs/deployment.md](docs/deployment.md) for running
the demo stack.

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/) so
release notes can be generated:

- `feat(editor): add color picker tokens`
- `fix(renderer): escape attribute values in raw HTML block`
- `docs(integration): clarify CORS for cross-origin cookies`
- `chore(deps): bump tiptap to 2.5`

Breaking changes go in the footer:

```
feat(core): replace flat variables with typed schema

BREAKING CHANGE: `variables` prop is deprecated, use `schema`.
```

## Pull requests

1. Fork or branch from `develop`.
2. Run `pnpm ci` locally before pushing.
3. Add or update tests for any behaviour change.
4. Update relevant docs under `docs/` and the package README.
5. Add a `CHANGELOG.md` entry under `## [Unreleased]`.
6. Open a PR against `develop` using the PR template.

## Code style

- Biome is the source of truth (`pnpm lint` / `pnpm check`).
- TypeScript strict mode; no `any` in public API.
- Public exports must have JSDoc.
- Tests live next to the package: `packages/<pkg>/test/*.test.ts`.

## Reporting bugs / requesting features

Use the issue templates under `.github/ISSUE_TEMPLATE/`. Security issues:
see [SECURITY.md](SECURITY.md).
