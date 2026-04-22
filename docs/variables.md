# Variables & merge tags

Lettera supports two merge-tag models: a **flat list** (legacy,
Mailchimp-style) and a **typed schema** (recommended for any structured
data like customers, orders, invoices).

## When to use which

| Situation | Use |
| --- | --- |
| You already emit Mailchimp-style `*|TAG|*` tags | Flat `VariableDefinition[]` |
| Your CRM has nested objects, lists, dates, currencies | `VariableSchema` |
| Both (migrating) | Both — the renderer will use the schema when present |

Flat variables are ideal for ad-hoc tags (`unsubscribe_url`). Typed
schemas are ideal for real customer data (`customer.address.city`,
`order.items[].total`).

## Flat variables (legacy)

```ts
import type { VariableDefinition } from '@lettera/core';

const variables: VariableDefinition[] = [
  { path: 'user.firstName', label: 'First name', sampleValue: 'Maria', type: 'string' },
  { path: 'unsubscribe_url', label: 'Unsubscribe URL', type: 'url' },
];

<LetteraEditor document={doc} variables={variables} />
```

The `path` is the canonical key for the variable. It is stored in the
document as a typed chip (`<span data-lettera-var="path">…</span>`) in
rich-text fields, and emitted as the host's merge-tag syntax at export.
Keep paths to JavaScript-identifier characters (alphanumerics, `_`,
`.`); spaces and other punctuation will be passed through verbatim and
are unlikely to be understood by your ESP.

The editor renders these as insertable chips in the Variables panel.
The renderer substitutes them at export time using a `MergeTagFormatter`
(default `{{path}}`; built-in Mailchimp and SendGrid variants are
exported from `@lettera/core`).

```ts
import {
  defaultMergeTagFormatter,        // {{path}}
  mailchimpMergeTagFormatter,       // *|PATH|*
} from '@lettera/core';

render(doc, { variables, mergeTagFormatter: mailchimpMergeTagFormatter });
```

## Typed schema (recommended)

```ts
import type { VariableSchema } from '@lettera/core';

const schema: VariableSchema = {
  root: {
    kind: 'object',
    fields: {
      customer: {
        kind: 'object',
        fields: {
          firstName: { kind: 'string', label: 'First name', sample: 'Maria' },
          email:     { kind: 'email',  label: 'Email',      sample: 'maria@example.com' },
        },
      },
      order: {
        kind: 'object',
        fields: {
          total:     { kind: 'currency', currency: 'EUR', sample: 129.9 },
          createdAt: { kind: 'datetime', sample: '2026-04-21T10:00:00Z' },
          items: {
            kind: 'list',
            item: {
              kind: 'object',
              fields: {
                name:  { kind: 'string', sample: 'Widget' },
                price: { kind: 'currency', currency: 'EUR', sample: 12.5 },
              },
            },
          },
        },
      },
    },
  },
};

<LetteraEditor
  document={doc}
  schema={schema}
  data={realCustomer}   // optional — used for preview
/>
```

With a schema in place:

- The Variables panel renders a tree view and supports drilling into
  nested objects.
- The Repeater block discovers list sources (`order.items`) and
  instantiates its children once per item.
- The Conditional block can bind to typed booleans.
- Formatting is automatic — `kind: 'currency'` renders
  `129,90 €` (locale-aware), `kind: 'datetime'` renders via the
  configured formatter.

## Preview vs export

Two render modes:

```ts
render(doc, { registry, schema, data, mode: 'preview' });
// → sample values substituted inline

render(doc, { registry, schema, data, mode: 'export' });
// → emits merge tags for your ESP to substitute
```

In `'preview'` mode the renderer walks the schema and falls back to the
`sample` property on each node when `data` doesn't supply a value. If
`sample` is also missing the path renders as the empty string.

In `'export'` mode the renderer emits the tag syntax produced by
`mergeTagFormatter` (default `{{customer.firstName}}`), leaving runtime
substitution to the ESP or downstream mail merger.

## Conditional expressions

The Conditional block (and any `evaluate()` call from a custom block)
parses a small expression language against your `data` + `schema`.

### Supported operators

| Category | Operators | Example |
| --- | --- | --- |
| Path access | `.`, `[idx]` | `customer.address.city`, `order.items[0].name` |
| Comparison | `===`, `!==`, `==`, `!=`, `>`, `<`, `>=`, `<=` | `customer.age >= 18` |
| Logical | `&&`, `\|\|`, `!` | `order.total > 100 && customer.vip` |
| Truthiness | bare path | `customer.company` (truthy if non-null and non-empty) |
| Literals | strings, numbers, `true`, `false`, `null` | `customer.tier === 'premium'` |

### Limitations

- No arithmetic (`+`, `-`, `*`, `/`).
- No function calls or method chains (`Array.prototype.includes`, etc.).
- No object/array literals.
- Returns `undefined` on parse error so blocks render gracefully.

For anything more complex, pre-compute a boolean field server-side and
reference it directly: `flags.showVipBanner`.

### Sample lists in preview

List nodes (`kind: 'list'`) accept an optional `sampleCount` (default
`3`) controlling how many synthetic items the preview renderer emits
from `item.sample`. When real `data` is supplied, `sampleCount` is
ignored and the actual list length is used.

## Formatters

Scalar kinds map to built-in formatters:

| Kind | Default output |
| --- | --- |
| `string` | raw string |
| `number` | `toLocaleString()` |
| `date` | ISO date |
| `datetime` | locale datetime |
| `currency` | locale currency using `currency` field |
| `url` | passthrough (validated) |
| `email` | passthrough (validated) |
| `boolean` | `'true' / 'false'` |

Override with `defaultFormatters` / `FormatterRegistry` from
`@lettera/core`:

```ts
import { defaultFormatters, render } from '@lettera/email-builder/server';

const formatters = {
  ...defaultFormatters,
  currency: (value, { currency }) => new Intl.NumberFormat('sk-SK', {
    style: 'currency', currency,
  }).format(value as number),
};

render(doc, { registry, schema, data, formatters });
```

### Custom formatters in the editor canvas

The canvas preview inside the editor calls `render()` internally with
the stock `defaultFormatters`. There is no public hook for swapping them
at runtime today. If your locale-specific formatting *must* be visible
inside the editor (not just in the final exported HTML), the supported
workaround is to register custom blocks whose `exportRender` formats
values itself instead of relying on the schema's `currency` / `datetime`
kinds:

```ts
defineBlock({
  // …
  exportRender: ({ node, ctx }) => {
    const raw = ctx.resolveVariable(node.props.amountPath);
    const formatted = new Intl.NumberFormat('sk-SK', {
      style: 'currency', currency: 'EUR',
    }).format(Number(raw));
    return `<span>${ctx.escape(formatted)}</span>`;
  },
});
```

A first-class formatter override on `<LetteraEditor>` is on the roadmap.

## Migrating from flat to typed

`flatVariablesToSchema(variables)` lifts a legacy list into a schema so
you can opt in incrementally:

```ts
import { flatVariablesToSchema } from '@lettera/core';

const schema = flatVariablesToSchema(legacyVariables);
```

You can supply both `variables` and `schema` to the editor at once. The
renderer prefers the schema when a path is found there; otherwise it
falls back to the flat list.

## Resolving paths programmatically

For custom blocks or validators:

```ts
import { resolveValuePath, resolveSchemaPath } from '@lettera/core';

const value = resolveValuePath(data, 'order.items.0.name');
const node  = resolveSchemaPath(schema, 'order.items.0.name');
// node.kind === 'string', node.sample === 'Widget'
```
