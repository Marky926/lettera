# @lettera/email-builder

Meta-package that bundles the entire Lettera stack behind a single
import. Most integrators only need this package.

```bash
pnpm add @lettera/email-builder react react-dom
```

```tsx
import { LetteraEditor, usePersistence } from '@lettera/email-builder';
import { render, BlockRegistry, standardBlocks } from '@lettera/email-builder/server';
import '@lettera/editor/styles.css';
```

## Entrypoints

| Entrypoint | Exports | React required? |
| --- | --- | --- |
| `.` (default) | Everything | Yes |
| `./server` | `@lettera/core`, `@lettera/renderer`, `@lettera/sdk`, `standardBlocks`, `StandardBlocks` namespace | No |
| `./editor` | `@lettera/editor` (component + store + hooks) | Yes |
| `./hooks` | `usePersistence`, `useVersions`, `usePreview` + types | Yes |
| `./styles.css` | Editor stylesheet | — |

## Why split entrypoints?

A Node worker that only renders emails has no business shipping React or
Tiptap. Import from `/server` and your bundle contains only the
renderer + core + SDK.

## Naming ambiguity

`RepeaterBlock` / `ConditionalBlock` mean two different things in the
stack:

- **Schema type** (from `@lettera/core`) — the shape of the node inside
  `EmailDocument`.
- **Block definition** (from `@lettera/blocks-standard`) — the runtime
  descriptor registered with the renderer.

The meta-package re-exports the schema types by their original names
and puts the block definitions under a namespace to avoid the clash:

```ts
import { RepeaterBlock } from '@lettera/email-builder';       // schema type
import { StandardBlocks } from '@lettera/email-builder';
const repeater = StandardBlocks.RepeaterBlock;                 // block def
registry.registerAll(standardBlocks);                          // array
```

## Documentation

See the [repository root](https://github.com/your-org/lettera) for
guides on [getting started](../../docs/getting-started.md),
[integration](../../docs/integration.md),
[variables](../../docs/variables.md), and
[custom blocks](../../docs/custom-blocks.md).
