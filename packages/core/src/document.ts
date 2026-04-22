/**
 * Document-level helpers used by editor, renderer, and tests.
 */
import { newId } from './ids.js';
import {
  type AnyNode,
  type Block,
  type Column,
  type ColumnWidth,
  DEFAULT_CONTENT_WIDTH,
  type EmailDocument,
  type Row,
  SCHEMA_VERSION,
  type Section,
} from './schema/index.js';
import { defaultTheme } from './tokens/index.js';

/** Build a fresh column with the given fractional width. */
export function makeColumn(width: ColumnWidth = '1/1'): Column {
  return {
    id: newId('col'),
    type: 'column',
    props: { width, verticalAlign: 'top' },
    children: [],
  };
}

/** Build a fresh row, optionally pre-populated with columns of the given widths. */
export function makeRow(columnWidths: readonly ColumnWidth[] = ['1/1']): Row {
  return {
    id: newId('row'),
    type: 'row',
    props: { stackReverse: false },
    children: columnWidths.map((w) => makeColumn(w)),
  };
}

/** Build a fresh section, optionally with a starter row. */
export function makeSection(opts: { contentWidth?: number; withRow?: boolean } = {}): Section {
  return {
    id: newId('sec'),
    type: 'section',
    props: {
      contentWidth: opts.contentWidth ?? DEFAULT_CONTENT_WIDTH,
      fullWidthBackground: false,
    },
    children: opts.withRow !== false ? [makeRow(['1/1'])] : [],
  };
}

/** Build a fresh block of the requested type with default props. */
export function makeBlock<T extends Block['type']>(
  type: T,
  props: Extract<Block, { type: T }>['props'],
): Block {
  // Container blocks (repeater/conditional) need an empty children array
  // so renderers can iterate without an undefined check; conditional also
  // initialises an empty `else` branch.
  if (type === 'block.repeater') {
    return { id: newId('blk'), type, props, children: [] } as unknown as Block;
  }
  if (type === 'block.conditional') {
    return { id: newId('blk'), type, props, children: [], else: [] } as unknown as Block;
  }
  return { id: newId('blk'), type, props } as Block;
}

/** Create an empty, valid document with one section/row/column. */
export function createEmptyDocument(name = 'Untitled'): EmailDocument {
  const now = new Date().toISOString();
  return {
    id: newId('doc'),
    schemaVersion: SCHEMA_VERSION,
    metadata: { name, createdAt: now, updatedAt: now },
    theme: defaultTheme,
    body: { contentWidth: DEFAULT_CONTENT_WIDTH },
    root: [makeSection({ withRow: true })],
    components: [],
  };
}

/** Walk every node in the document depth-first, including the document itself. */
export function walk(
  doc: EmailDocument,
  visit: (node: AnyNode, parent: AnyNode | null) => void,
): void {
  visit(doc, null);
  const visitBlock = (block: AnyNode, parent: AnyNode | null): void => {
    visit(block, parent);
    // Container blocks (repeater/conditional) own nested blocks.
    const b = block as { type?: string; children?: unknown[]; else?: unknown[] };
    if (b.type === 'block.repeater' || b.type === 'block.conditional') {
      if (Array.isArray(b.children)) {
        for (const child of b.children) visitBlock(child as AnyNode, block);
      }
      if (b.type === 'block.conditional' && Array.isArray(b.else)) {
        for (const child of b.else) visitBlock(child as AnyNode, block);
      }
    }
  };
  for (const section of doc.root) {
    visit(section, doc);
    for (const row of section.children) {
      visit(row, section);
      for (const column of row.children) {
        visit(column, row);
        for (const block of column.children) {
          visitBlock(block, column);
        }
      }
    }
  }
}

/** Find a node by id. O(n) — fine for editor docs (≤ a few hundred nodes). */
export function findNode(
  doc: EmailDocument,
  id: string,
): { node: AnyNode; parent: AnyNode | null } | undefined {
  let result: { node: AnyNode; parent: AnyNode | null } | undefined;
  walk(doc, (node, parent) => {
    if (!result && (node as { id?: string }).id === id) {
      result = { node, parent };
    }
  });
  return result;
}

/** Convenience predicates. */
export const isDocument = (n: { type?: string } | EmailDocument): n is EmailDocument =>
  (n as EmailDocument).schemaVersion !== undefined;

/** Make a deep copy with new ids — used for duplicating subtrees. */
export function reIdSubtree<T extends { id: string; children?: unknown[] }>(node: T): T {
  const cloned = structuredClone(node);
  const fix = (n: { id: string; type?: string; children?: unknown[] }) => {
    const prefix = (n.type ?? 'n').split('.').pop() ?? 'n';
    n.id = newId(prefix === 'block' ? 'blk' : prefix.slice(0, 3));
    if (Array.isArray(n.children)) {
      for (const c of n.children as Array<{ id: string; children?: unknown[] }>) fix(c);
    }
  };
  fix(cloned as unknown as { id: string; children?: unknown[] });
  return cloned;
}

/** Map a fractional column width to an integer percent for table layouts. */
export function columnWidthToPercent(w: Column['props']['width']): number {
  switch (w) {
    case '1/1':
      return 100;
    case '1/2':
      return 50;
    case '1/3':
      return Math.round(100 / 3);
    case '2/3':
      return Math.round((200 / 3) * 100) / 100;
    case '1/4':
      return 25;
    case '3/4':
      return 75;
  }
}
