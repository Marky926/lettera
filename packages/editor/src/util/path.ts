/**
 * Get/set a value on a plain object using a dotted path ("props.html").
 * Returns a new object on set (does not mutate input).
 */
import { type ColumnWidth, type EmailDocument, findNode } from '@lettera/core';

export function getByPath(obj: unknown, path: string): unknown {
  const segs = path.split('.');
  let cur: unknown = obj;
  for (const s of segs) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[s];
  }
  return cur;
}

export function setByPath<T>(obj: T, path: string, value: unknown): T {
  const segs = path.split('.');
  if (segs.length === 0) return obj;
  const root: Record<string, unknown> = { ...(obj as unknown as Record<string, unknown>) };
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const key = segs[i]!;
    const next = cur[key];
    cur[key] = next && typeof next === 'object' ? { ...(next as object) } : {};
    cur = cur[key] as Record<string, unknown>;
  }
  cur[segs[segs.length - 1]!] = value;
  return root as unknown as T;
}

/**
 * Build a partial props patch from a single inspector edit. Returns just the
 * top-level `props` slice so it can be passed to `doc/updateProps`.
 */
export function propsPatchFor(
  currentProps: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  if (!path.startsWith('props.')) return {};
  const sub = path.slice('props.'.length);
  const updated = setByPath({ ...currentProps }, sub, value);
  return updated;
}

// ---------------------------------------------------------------------------
// Document targeting helpers (shared by Palette + CommandPalette)
// ---------------------------------------------------------------------------

/** Column widths offered in the Palette (popular presets). */
export const COLUMN_WIDTH_PRESETS: readonly ColumnWidth[] = ['1/1', '1/2', '1/3', '1/4'] as const;

/** All valid column widths (used by the inspector dropdown). */
export const COLUMN_WIDTHS_ALL: readonly ColumnWidth[] = [
  '1/1',
  '1/2',
  '1/3',
  '2/3',
  '1/4',
  '3/4',
] as const;

/**
 * Decide which column to insert into and at which index, based on the current
 * selection. If a column is selected, append into it. If a block is selected,
 * insert right after it. Otherwise fall back to the first column in the doc.
 */
export function pickInsertTarget(
  doc: EmailDocument,
  selectedId: string | null,
): { columnId: string; index: number } | null {
  if (selectedId) {
    const found = findNode(doc, selectedId);
    if (found) {
      const node = found.node as { type?: string; id: string; children?: unknown[] };
      // Column or container-block selected — append into it.
      if (
        node.type === 'column' ||
        node.type === 'block.repeater' ||
        node.type === 'block.conditional'
      ) {
        const arr = (node.children ?? []) as unknown[];
        return { columnId: node.id, index: arr.length };
      }
      const parent = found.parent as { type?: string; id?: string; children?: unknown[] } | null;
      const parentIsContainer =
        parent?.type === 'column' ||
        parent?.type === 'block.repeater' ||
        parent?.type === 'block.conditional';
      if (parentIsContainer && parent?.id) {
        const arr = parent.children as Array<{ id: string }>;
        const idx = arr.findIndex((b) => b.id === node.id);
        return { columnId: parent.id, index: idx >= 0 ? idx + 1 : arr.length };
      }
    }
  }
  const firstSection = doc.root[0];
  const firstRow = firstSection?.children[0];
  const firstCol = firstRow?.children[0];
  if (firstCol) return { columnId: firstCol.id, index: firstCol.children.length };
  return null;
}

/** Find which section contains the current selection (defaults to first section). */
export function pickSectionId(doc: EmailDocument, selectedId: string | null): string | undefined {
  if (selectedId) {
    let cur = findNode(doc, selectedId);
    while (cur) {
      const n = cur.node as { type?: string; id?: string };
      if (n.type === 'section' && n.id) return n.id;
      if (!cur.parent) break;
      cur = findNode(doc, (cur.parent as { id?: string }).id ?? '');
    }
  }
  return doc.root[0]?.id;
}
