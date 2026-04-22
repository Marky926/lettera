# @lettera/core

Document model, command bus, theme tokens, and merge-tag schemas.
Framework-agnostic and side-effect-free.

```bash
pnpm add @lettera/core
```

## What's here

| Module | Exports |
| --- | --- |
| `schema/` | Zod schemas for `EmailDocument`, `Section`, `Row`, `Column`, `Block` variants |
| `document.ts` | `EmailDocument`, section/row helpers |
| `ids.ts` | `generateId()` — stable, URL-safe block ids |
| `tokens/` | `ThemeTokens`, `StyleDelta`, token resolution |
| `variables.ts` | Flat `VariableDefinition` model + built-in merge-tag formatters |
| `variableSchema.ts` | Typed `VariableSchema` model + path resolution |
| `commands/` | Command bus (dispatch, undo, redo) + standard command set |
| `expressions.ts` | Safe expression evaluator for Conditional / Repeater blocks |
| `formatters.ts` | Scalar formatters (currency, date, …) for the typed schema |

## Quick reference

```ts
import {
  type EmailDocument,
  createDocument,
  BlockRegistry,
  generateId,
} from '@lettera/core';
```

## Command bus

The store in `@lettera/editor` uses a command bus from this package. Every
mutation goes through `dispatch(command)` which runs it through Immer so
undo/redo are free. Commands are plain JSON — safe to log, replay,
ship across the wire.

```ts
import { applyCommand, standardCommands } from '@lettera/core';

const next = applyCommand(doc, {
  type: 'block.insert',
  payload: { /* ... */ },
});
```

See [`docs/custom-blocks.md`](../../docs/custom-blocks.md) for the full
block authoring guide and [`docs/variables.md`](../../docs/variables.md)
for the variable / merge-tag model.
