/**
 * Typed variable schema — the second-generation merge-tag model.
 *
 * The first generation (`VariableDefinition`) is a flat list of
 * `path → string` entries that the editor inserts as inline chips. That model
 * still works for ad-hoc Mailchimp-style merge tags but cannot describe:
 *
 *   - **nested objects** (`customer.address.city`),
 *   - **collections** that need to be iterated (`services`, `meteringPoints`),
 *   - **typed values** (currency, date) that need server-side formatting.
 *
 * `VariableSchema` is a recursive, declarative description of *what* a
 * template may reference, independent of *who* supplies the data. The host
 * application owns the schema once at startup; per-recipient data is supplied
 * later as a plain JSON `VariableContext`.
 *
 * Design constraints:
 *   - **Pure data**: schema must round-trip through JSON so it can be sent
 *     across processes (editor ↔ server) without losing information.
 *   - **Backward compat**: `flatVariablesToSchema()` turns the legacy
 *     `VariableDefinition[]` into a schema, so existing hosts keep working
 *     while they migrate.
 *   - **Bounded**: no callbacks, no functions, no Turing-complete bits. All
 *     dynamic behaviour (formatting, conditionals, iteration) lives in the
 *     renderer / expression evaluator, not in the schema.
 */

import type { VariableDefinition } from './variables.js';

// ---------------------------------------------------------------------------
// Schema node types
// ---------------------------------------------------------------------------

export type ScalarKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'currency'
  | 'url'
  | 'email';

/** Leaf node — a single value reachable at this path. */
export interface ScalarSchema {
  readonly kind: ScalarKind;
  /** Human label for the picker UI. */
  readonly label?: string;
  /** Free-form description shown as tooltip. */
  readonly description?: string;
  /** Sample used in editor preview when no real data is bound. */
  readonly sample?: unknown;
  /** Currency code (`'EUR'`, `'USD'`) — only meaningful when kind = 'currency'. */
  readonly currency?: string;
  /** Optional fallback substituted at render time when real value is null/undefined. */
  readonly fallback?: string;
}

/** Object node — a record of named child fields. */
export interface ObjectSchema {
  readonly kind: 'object';
  readonly label?: string;
  readonly description?: string;
  readonly fields: Readonly<Record<string, VariableSchemaNode>>;
}

/**
 * List node — an array of items, each described by `item`. Iteration in the
 * renderer creates a local scope where the loop variable name aliases an item.
 */
export interface ListSchema {
  readonly kind: 'list';
  readonly label?: string;
  readonly description?: string;
  /** Sample row count used in editor preview rendering. */
  readonly sampleCount?: number;
  readonly item: ObjectSchema | ScalarSchema;
}

export type VariableSchemaNode = ScalarSchema | ObjectSchema | ListSchema;

/**
 * The root of a variable schema: a record of top-level groups (`customer`,
 * `services`, …). Top-level entries can be objects, lists, or scalars.
 */
export interface VariableSchema {
  readonly fields: Readonly<Record<string, VariableSchemaNode>>;
}

// ---------------------------------------------------------------------------
// Path utilities
// ---------------------------------------------------------------------------

/**
 * Tokenises a dotted variable path into segments. Bracket notation (`a[0].b`)
 * is supported so callers can address list items by index when the renderer
 * has unrolled them. We keep numeric segments as strings — type ambiguity is
 * resolved on lookup, not here.
 */
export function parseVariablePath(path: string): string[] {
  const out: string[] = [];
  let buf = '';
  for (let i = 0; i < path.length; i++) {
    const ch = path[i];
    if (ch === '.') {
      if (buf) out.push(buf);
      buf = '';
    } else if (ch === '[') {
      if (buf) out.push(buf);
      buf = '';
      const close = path.indexOf(']', i);
      if (close < 0) break;
      out.push(path.slice(i + 1, close));
      i = close;
    } else {
      buf += ch;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Resolve a dotted path against a schema, walking through `object.fields`,
 * `list.item`, and treating numeric segments as list-index passthroughs.
 *
 * Returns `undefined` when the path cannot be resolved — this signals an
 * **author mistake** (misspelt path, wrong segment) and the editor surfaces
 * it as a linter warning rather than a hard error.
 */
export function resolveSchemaPath(
  schema: VariableSchema,
  path: string,
): VariableSchemaNode | undefined {
  const segs = parseVariablePath(path);
  if (segs.length === 0) return undefined;

  let cur: VariableSchemaNode | undefined = schema.fields[segs[0]!];
  for (let i = 1; i < segs.length && cur; i++) {
    const seg = segs[i]!;
    if (cur.kind === 'object') {
      cur = cur.fields[seg];
    } else if (cur.kind === 'list') {
      // Numeric segment = "the item at that index". Non-numeric = field on the
      // item shape (only valid when the item is itself an object).
      if (/^\d+$/.test(seg)) {
        cur = cur.item;
      } else if (cur.item.kind === 'object') {
        cur = cur.item.fields[seg];
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * Resolve a dotted path against a runtime data context. Mirrors
 * `resolveSchemaPath` but for the actual values, with one extra rule: if the
 * caller passes a `scope` (e.g. `{ service: <listItem> }` inside a repeater),
 * its keys take precedence over the root context.
 */
export function resolveValuePath(
  ctx: VariableContext,
  path: string,
  scope?: Readonly<Record<string, unknown>>,
): unknown {
  const segs = parseVariablePath(path);
  if (segs.length === 0) return undefined;

  // Scope shadows root for the first segment only — once we've stepped into
  // the value, ordinary record/array lookup takes over.
  let cur: unknown = scope && Object.hasOwn(scope, segs[0]!) ? scope[segs[0]!] : ctx[segs[0]!];

  for (let i = 1; i < segs.length && cur != null; i++) {
    const seg = segs[i]!;
    if (Array.isArray(cur)) {
      const idx = Number(seg);
      cur = Number.isInteger(idx) ? cur[idx] : undefined;
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      cur = undefined;
    }
  }
  return cur;
}

/** Runtime data shape passed to the renderer. Plain JSON, no functions. */
export type VariableContext = Readonly<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// Discovery — flatten a schema into picker-friendly entries
// ---------------------------------------------------------------------------

export interface VariablePickerEntry {
  /** Dotted path that would be inserted into the document. */
  path: string;
  /** Localised / human label, falls back to the path's last segment. */
  label: string;
  /** Group label — for top-level entries this is the root field name. */
  group: string;
  /** Schema kind at this path (so the picker can show a type hint). */
  kind: ScalarKind | 'object' | 'list';
  /**
   * For list paths we also surface their item shape so the picker can offer
   * "drag this list to insert a Repeater" UX.
   */
  itemShape?: ObjectSchema | ScalarSchema;
  description?: string;
}

/**
 * Walk a schema producing one entry per addressable scalar plus one entry per
 * list (for repeater placement). Object nodes are not surfaced as insertable
 * — only their leaves are — but the caller can group entries by their `group`
 * field to render an expandable tree.
 */
export function listSchemaEntries(schema: VariableSchema): VariablePickerEntry[] {
  const out: VariablePickerEntry[] = [];
  for (const [topName, top] of Object.entries(schema.fields)) {
    walk(top, topName, topName, out);
  }
  return out;
}

function walk(
  node: VariableSchemaNode,
  path: string,
  group: string,
  out: VariablePickerEntry[],
): void {
  if (node.kind === 'object') {
    for (const [name, child] of Object.entries(node.fields)) {
      walk(child, `${path}.${name}`, group, out);
    }
    return;
  }
  if (node.kind === 'list') {
    out.push({
      path,
      label: node.label ?? path.split('.').pop() ?? path,
      group,
      kind: 'list',
      itemShape: node.item,
      ...(node.description ? { description: node.description } : {}),
    });
    // Also surface item-scoped scalar entries so the picker shows what fields
    // become available *inside* a repeater body. Their `path` is prefixed
    // with the list path and a sentinel `[]` segment so editor code can tell
    // them apart from concrete addresses.
    if (node.item.kind === 'object') {
      for (const [name, child] of Object.entries(node.item.fields)) {
        walk(child, `${path}[].${name}`, group, out);
      }
    } else {
      out.push({
        path: `${path}[]`,
        label: node.item.label ?? 'item',
        group,
        kind: node.item.kind,
        ...(node.item.description ? { description: node.item.description } : {}),
      });
    }
    return;
  }
  // Scalar leaf.
  out.push({
    path,
    label: node.label ?? path.split('.').pop() ?? path,
    group,
    kind: node.kind,
    ...(node.description ? { description: node.description } : {}),
  });
}

// ---------------------------------------------------------------------------
// Backward compatibility with the flat VariableDefinition[] model
// ---------------------------------------------------------------------------

/**
 * Turn the legacy flat list into a `VariableSchema` so the new renderer code
 * has a single source of truth. Every entry becomes a top-level scalar field
 * keyed by its full dotted path. The conversion is lossless within the limits
 * of the old model (no objects, no lists).
 */
export function flatVariablesToSchema(vars: readonly VariableDefinition[]): VariableSchema {
  const fields: Record<string, VariableSchemaNode> = {};
  for (const v of vars) {
    fields[v.path] = scalarFromFlat(v);
  }
  return { fields };
}

function scalarFromFlat(v: VariableDefinition): ScalarSchema {
  return {
    kind: (v.type ?? 'string') as ScalarKind,
    ...(v.label ? { label: v.label } : {}),
    ...(v.description ? { description: v.description } : {}),
    ...(v.sampleValue != null ? { sample: v.sampleValue } : {}),
    ...(v.defaultValue != null ? { fallback: v.defaultValue } : {}),
  };
}

/**
 * Inverse of `flatVariablesToSchema` — emits a flat list of every scalar
 * leaf in the schema. Used by the editor's `<VariableNode>` picker so it can
 * keep displaying a single flat list while the host moves to typed schema.
 */
export function schemaToFlatVariables(schema: VariableSchema): VariableDefinition[] {
  const out: VariableDefinition[] = [];
  for (const entry of listSchemaEntries(schema)) {
    if (entry.kind === 'object' || entry.kind === 'list') continue;
    out.push({
      path: entry.path,
      label: entry.label,
      group: entry.group,
      type: entry.kind,
      ...(entry.description ? { description: entry.description } : {}),
    });
  }
  return out;
}
