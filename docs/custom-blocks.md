# Custom blocks

Ship your own domain-specific blocks alongside the standard library
(Heading, Text, Button, Image, …). A block is three things:

1. A **Zod schema** for its `props`.
2. A **pure export render function** that emits email-safe HTML.
3. An optional **inspector schema** so users can edit props via the UI.

Bump the block's `version` integer whenever you change `propsSchema` or
the shape of the HTML emitted by `exportRender`. The number is reserved
for schema migrations across saved documents.

## Anatomy

```ts
import { defineBlock, z } from '@lettera/email-builder';
import type { Block } from '@lettera/core';

const ProductCardProps = z.object({
  productId: z.string(),
  ctaLabel: z.string().default('Buy now'),
  showPrice: z.boolean().default(true),
});
type ProductCardProps = z.infer<typeof ProductCardProps>;

// Widen the block union by asserting the new type. In production you'd
// do this via module augmentation or a plugin-typed registry.
type ProductCard = Block & {
  type: 'block.productCard';
  props: ProductCardProps;
};

export const ProductCardBlock = defineBlock<ProductCard>({
  type: 'block.productCard',
  name: 'Product card',
  category: 'Marketing',
  icon: 'package',
  version: 1,
  propsSchema: ProductCardProps,
  defaultProps: { productId: '', ctaLabel: 'Buy now', showPrice: true },

  exportRender: ({ node, ctx }) => {
    // In `'export'` mode emit merge-tag syntax (e.g. `{{products.<id>.name}}`)
    // for the ESP to substitute. In `'preview'` mode resolve the value from
    // sample data on the schema (or the runtime `data` passed to render()).
    const tag = (path: string) =>
      ctx.mode === 'export' ? ctx.formatMergeTag(path) : ctx.escape(ctx.resolveVariable(path));

    const base = `products.${node.props.productId}`;
    if (ctx.mode === 'preview' && !ctx.resolveVariable(`${base}.name`)) {
      // Surface a linter warning so the integrator sees missing sample data.
      ctx.warn('Unknown product', { code: 'product.unknown', nodeId: node.id });
    }
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td><img src="${tag(`${base}.image`)}" alt="${tag(`${base}.name`)}" width="200" /></td>
          <td>
            <h3>${tag(`${base}.name`)}</h3>
            ${node.props.showPrice ? `<p>${tag(`${base}.price`)}</p>` : ''}
            <a href="${tag(`${base}.url`)}" style="display:inline-block;padding:10px 16px;background:#1f6feb;color:#fff;text-decoration:none;border-radius:6px">
              ${ctx.escape(node.props.ctaLabel)}
            </a>
          </td>
        </tr>
      </table>
    `;
  },

  inspector: {
    tabs: [{
      id: 'content',
      label: 'Content',
      groups: [{
        id: 'main',
        label: 'Main',
        controls: [
          { kind: 'text',    path: 'props.productId', label: 'Product ID' },
          { kind: 'text',    path: 'props.ctaLabel',  label: 'CTA label' },
          { kind: 'boolean', path: 'props.showPrice', label: 'Show price' },
        ],
      }],
    }],
  },
});
```

## Registering the block

```ts
import { BlockRegistry, standardBlocks } from '@lettera/email-builder';

const registry = new BlockRegistry();
registry.registerAll(standardBlocks);
registry.register(ProductCardBlock);
```

Then pass the registry into `render()` on the server. The editor has
its own registry (via `setRegistry` / `getRegistry`); register custom
blocks there too so they show up in the palette.

## Inspector controls

`InspectorControlKind` enumerates the supported kinds:

```ts
import type { InspectorControlKind } from '@lettera/sdk';

// 'text' | 'number' | 'boolean' | 'select' | 'color' | 'tokenPicker'
// | 'spacing' | 'image' | 'datetime' | 'group'
```

Control `path` strings use dot notation to address fields on the block
node. The two top-level roots you care about are:

- `props.*` — the block's own props (typed by `propsSchema`).
- `styles.*` — the standard styling props (margin, padding, alignment
  …) injected by the editor.

Groups nest — use `{ kind: 'group', label, controls: [...] }` to create
labelled clusters.

> Custom control kinds (e.g. a "product picker") are not supported in
> this release. Open an issue if you need one — for now, fall back to a
> `text` control and validate at render time.

## Render context

The `ctx` object passed to `exportRender` is `RenderContext` from
`@lettera/sdk`. It exposes:

| Field / method | Signature | Purpose |
| --- | --- | --- |
| `ctx.doc` | `EmailDocument` | The full document being rendered. |
| `ctx.theme` | `ThemeTokens` | Theme tokens (color, spacing, radius, typography). |
| `ctx.device` | `'desktop' \| 'mobile'` | Target device for responsive output. |
| `ctx.mode` | `'preview' \| 'export'` | `'preview'` substitutes sample/runtime values; `'export'` emits merge-tag syntax. |
| `ctx.variables` | `readonly VariableDefinition[]` | Flat (legacy) merge-tag list passed to `render()`. |
| `ctx.schema` | `VariableSchema?` | Typed variable schema, when one was supplied. |
| `ctx.data` | `VariableContext?` | Runtime values bound to `schema` (preview only). |
| `ctx.escape(value)` | `(string) => string` | HTML-escape arbitrary text before embedding it in the output. **Use this for every untrusted string.** |
| `ctx.resolve(value)` | `<T>(T \| { $token: string }) => T \| undefined` | Resolve a token reference (e.g. `{ $token: 'color.brand.primary' }`) to its concrete value, or pass through a literal. |
| `ctx.formatMergeTag(path)` | `(string) => string` | Emit the host's merge-tag syntax for a path (e.g. `{{customer.email}}`). Use in export mode. |
| `ctx.resolveVariable(path)` | `(string) => string` | Resolve a path to its preview/sample value (string-coerced). Returns `''` for unknown paths. Use in preview mode. |
| `ctx.evaluate?(source, scope?)` | `(string, ScopeMap?) => unknown` | Evaluate a template expression (paths, comparisons, logical ops). Only present when a typed schema was supplied; legacy callers should fall back to `resolveVariable`. Returns `undefined` on parse error. |
| `ctx.warn(message, opts?)` | `(string, { code?, nodeId?, quickFixes? }) => void` | Append a lint warning. `nodeId` highlights a specific block in the editor; omit for document-level warnings. `quickFixes` may dispatch commands through the editor's command bus. |

### Severity guidance for `ctx.warn`

- **info** — cosmetic or accessibility nits (missing alt text, low color
  contrast). Use the linter's `severity: 'info'` channel via a custom
  validator (see below) rather than a raw `warn()` call.
- **warn** — likely template bugs the author should fix (unresolved
  variables, unknown product IDs, suspicious URLs). The default for
  `ctx.warn`.
- **error** — render produced an empty / broken output. Use sparingly;
  rendering should still complete.

## Validators (linter rules)

Add custom validators that run during render or on-demand in the editor:

```ts
import { defineValidator } from '@lettera/email-builder';

export const MissingCtaValidator = defineValidator({
  code: 'marketing.missing-cta',
  scope: 'document',
  severity: 'warn',
  check({ doc }) {
    const hasButton = walk(doc).some((b) => b.type === 'block.button');
    if (!hasButton) {
      return {
        code: 'marketing.missing-cta',
        severity: 'warn',
        message: 'Marketing emails should include a clear call to action.',
      };
    }
  },
});
```

Validators can emit `quickFixes` that dispatch commands through the
editor's command bus — see `@lettera/sdk` types for the shape.

## Plugins

Bundle related blocks, validators, and export hooks into a plugin:

```ts
import { definePlugin } from '@lettera/email-builder';

export const EcommercePlugin = definePlugin({
  name: 'ecommerce',
  version: '1.0.0',
  blocks: [ProductCardBlock, CategoryGridBlock],
  validators: [MissingCtaValidator],
  exportHooks: [InlineCssHook],
});
```

Host applications load plugins by iterating `plugin.blocks` /
`plugin.validators` / etc. and registering each with the appropriate
registry.

## Editor render (WYSIWYG preview inside the editor)

By default a custom block renders its `exportRender` output inside the
editor canvas. For richer in-editor affordances (slot editing, selection
handles), supply an `editorRender` — a React component typed by the
editor layer. Typical custom blocks do not need this; the default
preview is usually sufficient.
