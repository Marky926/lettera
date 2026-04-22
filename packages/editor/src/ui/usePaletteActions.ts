/**
 * Shared insertion helpers + row presets used by both the classic `Palette`
 * sidebar and the compact `RightPanel` Content/Blocks tabs. Keeping the
 * dispatch path in one place guarantees both shells produce identical
 * documents (and identical undo entries).
 */

import type { ColumnWidth } from '@lettera/core';
import { useCallback } from 'react';
import { getRegistry, makeBlockFromDef } from '../registry.js';
import { useEditorStore, useEditorStoreApi } from '../store/editorStore.js';
import { pickInsertTarget, pickSectionId } from '../util/path.js';

export interface RowPreset {
  id: string;
  label: string;
  columns: ColumnWidth[];
}

export const ROW_PRESETS: readonly RowPreset[] = [
  { id: 'r-1', label: '1 column', columns: ['1/1'] },
  { id: 'r-2', label: '2 columns', columns: ['1/2', '1/2'] },
  { id: 'r-3', label: '3 columns', columns: ['1/3', '1/3', '1/3'] },
  { id: 'r-4', label: '4 columns', columns: ['1/4', '1/4', '1/4', '1/4'] },
  { id: 'r-1-2', label: '1/3 + 2/3', columns: ['1/3', '2/3'] },
  { id: 'r-2-1', label: '2/3 + 1/3', columns: ['2/3', '1/3'] },
];

export function colFlex(w: ColumnWidth): number {
  switch (w) {
    case '1/4':
      return 1;
    case '1/3':
      return 2;
    case '1/2':
      return 3;
    case '2/3':
      return 4;
    case '3/4':
      return 5;
    case '1/1':
    default:
      return 6;
  }
}

export interface PaletteActions {
  insertBlock(type: string, defaultProps: unknown): void;
  insertRow(columns: ColumnWidth[]): void;
  insertSection(): void;
}

export function usePaletteActions(): PaletteActions {
  const storeApi = useEditorStoreApi();
  const dispatch = useEditorStore((s) => s.dispatch);
  const select = useEditorStore((s) => s.select);

  const insertBlock = useCallback(
    (type: string, _defaultProps: unknown) => {
      const def = getRegistry().get(type);
      if (!def) return;
      const state = storeApi.getState();
      const target = pickInsertTarget(state.doc, state.selection?.id ?? null);
      if (!target) return;
      const block = makeBlockFromDef(def);
      dispatch('doc/insertBlock', {
        parentId: target.columnId,
        index: target.index,
        block,
      });
      select({ id: block.id, type: 'block' });
    },
    [dispatch, select, storeApi],
  );

  const insertRow = useCallback(
    (columns: ColumnWidth[]) => {
      const state = storeApi.getState();
      const sectionId = pickSectionId(state.doc, state.selection?.id ?? null);
      if (!sectionId) return;
      dispatch('doc/insertRow', { sectionId, columns });
    },
    [dispatch, storeApi],
  );

  const insertSection = useCallback(() => {
    const before = storeApi.getState().doc.root.length;
    dispatch('doc/insertSection', {});
    // Auto-select the newly inserted section so subsequent row/block
    // actions target it (otherwise they fall back to the first section).
    const after = storeApi.getState().doc;
    if (after.root.length > before) {
      const created = after.root[after.root.length - 1];
      if (created) select({ id: created.id, type: 'section' });
    }
  }, [dispatch, select, storeApi]);

  return { insertBlock, insertRow, insertSection };
}
