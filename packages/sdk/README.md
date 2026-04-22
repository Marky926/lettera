# @lettera/sdk

Public plugin contracts — types only, framework-agnostic. Import this
package to author custom blocks, validators, export hooks, or template
sources without pulling in React or the renderer.

```bash
pnpm add @lettera/sdk @lettera/core
```

## Core contracts

| Symbol | Purpose |
| --- | --- |
| `defineBlock(def)` | Declare a block — propsSchema, defaultProps, `exportRender`, optional inspector |
| `definePlugin(def)` | Bundle blocks + validators + hooks behind a name |
| `defineValidator(def)` | Custom lint rule (document- or node-scoped) |
| `defineExportHook(def)` | `beforeRender` / `afterRender` interceptors |
| `InspectorControl` | Declarative inspector control union |
| `InspectorControlKind` | Discriminator of `InspectorControl` |
| `RenderContext` | Passed to every `exportRender` — tokens, variables, data, formatters, `warn` |
| `LintResult`, `LintQuickFix` | Shape of lint warnings and their quick-fix commands |

## Minimal example

```ts
import { defineBlock, z } from '@lettera/sdk';
import type { Block } from '@lettera/core';

type Ping = Block & { type: 'block.ping'; props: { label: string } };

export const PingBlock = defineBlock<Ping>({
  type: 'block.ping',
  name: 'Ping',
  category: 'Advanced',
  version: 1,
  propsSchema: z.object({ label: z.string().default('pong') }),
  defaultProps: { label: 'pong' },
  exportRender: ({ node }) => `<p>${node.props.label}</p>`,
});
```

See [`docs/custom-blocks.md`](../../docs/custom-blocks.md) for a full
walkthrough including inspector schemas, validators, and plugins.
