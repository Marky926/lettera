# Lettera

> Embeddable visual email builder for SaaS and CRM products.

Lettera is a drop-in email-template editor and renderer. Install one
package, pass your existing auth-backed REST endpoints, and your users
get a full WYSIWYG editor with drag-and-drop blocks, merge tags, version
history, and email-safe HTML output.

```tsx
import { LetteraEditor } from '@lettera/email-builder';
import '@lettera/editor/styles.css'; // required

export function TemplatePage({ template }) {
  return (
    <LetteraEditor
      document={template.content}
      autosaveDelay={1500} // ms
      onSave={async (doc, { signal }) => {
        await fetch(`/api/templates/${template.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ content: doc }),
          headers: { 'Content-Type': 'application/json' },
          signal,
        });
      }}
      onSaveError={(err) => console.error('Autosave failed', err)}
    />
  );
}
```

That is the full integration. Autosave, abort-on-unmount, beforeunload
flush, undo/redo, keyboard shortcuts, mobile preview, plain-text
generation — all included.

## Install

```bash
pnpm add @lettera/email-builder react react-dom
# or: npm install @lettera/email-builder react react-dom
# or: yarn add @lettera/email-builder react react-dom
```

Lettera ships ES modules only. Use a modern bundler (Vite, Webpack 5+,
esbuild, Next.js, Remix). React 18.3 or React 19 are both supported.

The meta-package re-exports the entire stack behind a single import. For
bundler-size-sensitive hosts, split entrypoints are available:

| Import | Pulls in |
| --- | --- |
| `@lettera/email-builder` | Everything |
| `@lettera/email-builder/server` | Renderer + SDK, **no React** |
| `@lettera/email-builder/editor` | React editor + hooks |
| `@lettera/email-builder/hooks` | Just `usePersistence` / `useVersions` / `usePreview` |

## Documentation

- [Getting started](docs/getting-started.md) — 10-minute walkthrough from zero to a working editor
- [Integration guide](docs/integration.md) — authentication, persistence, versions, previews, SSR
- [Variables & merge tags](docs/variables.md) — flat vs typed schema, data binding, formatters
- [Custom blocks](docs/custom-blocks.md) — `defineBlock`, inspector schema, validators

## Packages

| Package | Purpose |
| --- | --- |
| [`@lettera/email-builder`](packages/email-builder) | Meta-package — install this one |
| [`@lettera/core`](packages/core) | Document model (Zod), command bus, tokens, variables |
| [`@lettera/sdk`](packages/sdk) | Public plugin contracts — framework-agnostic types |
| [`@lettera/renderer`](packages/renderer) | AST → email-safe table HTML + plain text |
| [`@lettera/blocks-standard`](packages/blocks-standard) | Built-in block library (heading, text, button, image, …) |
| [`@lettera/editor`](packages/editor) | React editor component, Zustand store, hooks |

## Repository layout

```
apps/
  api/         Fastify + Prisma backend used by the demo web app
  web/         Next.js 14 demo app (reference CRM integration)
  playground/  Standalone Vite playground
  cli/         `lettera render` — headless rendering
packages/
  core/        @lettera/core
  sdk/         @lettera/sdk
  renderer/    @lettera/renderer
  blocks-standard/ @lettera/blocks-standard
  editor/      @lettera/editor
  email-builder/ @lettera/email-builder
fixtures/      Sample documents for tests + CLI
```

## Local development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm --filter ./apps/web dev   # demo app on :3000
```

Node 20.12+ and pnpm 10+ required.

## License

[MIT](LICENSE) © Marek Jelsik


