# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-04-22

### Added

- Initial public release of Lettera as a monorepo.
- `@lettera/core` — document model (Zod), command bus, theme tokens,
  flat + typed variable schemas, expression evaluator, formatters.
- `@lettera/sdk` — framework-agnostic plugin contracts: `defineBlock`,
  `RenderContext`, inspector schema, validators, plugins.
- `@lettera/renderer` — AST → email-safe table HTML + plain text.
  Hardened against script/CSS/URL injection (see
  `test/security.test.ts`).
- `@lettera/blocks-standard` — Heading, Text, Button, Image, Spacer,
  Divider, HTML, Repeater, Conditional.
- `@lettera/editor` — React editor with classic and compact layouts,
  Zustand store, Tiptap rich-text, dnd-kit drag/drop, command palette,
  linter panel, mobile preview, `usePersistence` / `useVersions` /
  `usePreview` hooks.
- `@lettera/email-builder` — meta-package with split entrypoints
  (`/server` / `/editor` / `/hooks`) for tree-shaking.
- `@lettera/cli` — `lettera render` for headless HTML generation.
- `apps/api` — Fastify + Prisma reference backend (auth, workspaces,
  documents, versions).
- `apps/web` — Next.js 14 demo app (App Router, react-query).
- `apps/playground` — standalone Vite playground.
- Documentation: getting-started, integration, variables, custom-blocks,
  architecture, deployment, troubleshooting.

### Security

- HTML/CSS/URL sanitization in the renderer with regression tests.
- Sandboxed expression evaluator for Conditional / Repeater blocks.
- API: origin-guard CSRF protection, per-IP rate limits on auth,
  `httpOnly` + `sameSite=lax` cookies, bcrypt cost 13.

[Unreleased]: https://github.com/Marky926/lettera/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Marky926/lettera/releases/tag/v0.1.0
