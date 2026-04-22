# @lettera/renderer

`EmailDocument` → email-safe HTML + plain text. No React, no browser
APIs — runs anywhere Node / Deno / edge workers run.

```bash
pnpm add @lettera/renderer @lettera/blocks-standard
```

## Usage

```ts
import { render, BlockRegistry } from '@lettera/renderer';
import { standardBlocks } from '@lettera/blocks-standard';

const registry = new BlockRegistry();
registry.registerAll(standardBlocks);

const { html, text, warnings } = render(doc, {
  registry,
  device: 'desktop',          // 'desktop' (default) | 'mobile'
  mode: 'export',             // 'export' (default) | 'preview'
  schema,                     // optional typed VariableSchema
  data,                       // optional runtime values
  variables,                  // optional legacy flat list
  mergeTagFormatter,          // optional — default {{path}}
  formatters,                 // optional — override scalar formatters
});
```

## Output

- **`html`** — a complete HTML document using table-based layout,
  inlined styles where appropriate, and `<style>`-scoped responsive
  overrides keyed on `data-lettera-id` selectors. Ready to hand off to
  an ESP.
- **`text`** — plain-text fallback derived from the same AST so it never
  goes out of sync.
- **`warnings`** — `LintResult[]` from block-level `ctx.warn()` calls
  and built-in rules (unresolved variables, unsafe URLs, missing alt
  text, …).

## Registry

`BlockRegistry` resolves a block `type` string to a
`BlockDefinition.exportRender`. Pass the same registry instance to every
call so repeated renders hit its internal cache.

```ts
registry.register(MyCustomBlock);
registry.registerAll([HeadingBlock, TextBlock]);
registry.get('block.heading');
```

## See also

- [`@lettera/sdk`](../sdk) — author custom blocks with `defineBlock`
- [`@lettera/blocks-standard`](../blocks-standard) — built-in library
- [`docs/variables.md`](../../docs/variables.md) — merge-tag model
