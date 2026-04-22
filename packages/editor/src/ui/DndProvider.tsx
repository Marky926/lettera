/**
 * Editor-wide DnD context.
 *
 * One `DndContext` wraps both the Palette and Layers panel so a user can
 * drag a palette block straight onto a layers row (or column drop target),
 * and drag layers blocks across columns.
 *
 * Drag id schema:
 *   - "palette:<blockType>" — a fresh block from the palette
 *   - "<nodeId>"            — an existing block being reordered
 *
 * Drop targets:
 *   - "<blockId>"           — insert before/after that sibling block
 *   - "col:<columnId>"      — append to that column (used for empty columns)
 */

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { EmailDocument } from '@lettera/core';
import { findNode } from '@lettera/core';
import { type ReactNode, useMemo, useState } from 'react';
import { getRegistry, makeBlockFromDef } from '../registry.js';
import { useEditorStore, useEditorStoreApi } from '../store/editorStore.js';

export const PALETTE_PREFIX = 'palette:';
export const COLUMN_PREFIX = 'col:';
export const GAP_PREFIX = 'gap:'; // gap:<columnId>:<index>

interface DropResolution {
  columnId: string;
  index: number;
}

function resolveDrop(doc: EmailDocument, overId: string): DropResolution | null {
  if (overId.startsWith(GAP_PREFIX)) {
    const rest = overId.slice(GAP_PREFIX.length);
    const sep = rest.lastIndexOf(':');
    if (sep < 0) return null;
    const colId = rest.slice(0, sep);
    const idx = Number(rest.slice(sep + 1));
    if (!Number.isFinite(idx)) return null;
    return { columnId: colId, index: idx };
  }
  if (overId.startsWith(COLUMN_PREFIX)) {
    const containerId = overId.slice(COLUMN_PREFIX.length);
    const found = findNode(doc, containerId);
    if (!found) return null;
    const node = found.node as { type?: string; children?: unknown[] };
    // Accept columns and container blocks (repeater/conditional) as drop targets.
    const isContainer =
      node.type === 'column' || node.type === 'block.repeater' || node.type === 'block.conditional';
    if (!isContainer) return null;
    return { columnId: containerId, index: (node.children ?? []).length };
  }
  // Otherwise it's a node id. Could be a sibling block (insert before/after
  // it), OR a column / container-block row from the Layers panel where the
  // same DOM node registers BOTH a `useSortable` (id = node id) and a
  // `useDroppable("col:...")` target — `closestCenter` may pick the
  // sortable hit first, so we must accept a bare column / container-block
  // id here as "append into it" too. Without this, dragging a heading from
  // one column to another column row in the Layers panel silently no-ops.
  const found = findNode(doc, overId);
  if (!found) return null;
  const node = found.node as { type?: string; id: string; children?: unknown[] };
  if (
    node.type === 'column' ||
    node.type === 'block.repeater' ||
    node.type === 'block.conditional'
  ) {
    return { columnId: node.id, index: (node.children ?? []).length };
  }
  if (!found.parent) return null;
  const parent = found.parent as { type?: string; id?: string; children?: unknown[] };
  const parentIsContainer =
    parent.type === 'column' ||
    parent.type === 'block.repeater' ||
    parent.type === 'block.conditional';
  if (!parentIsContainer || !parent.id) return null;
  const arr = parent.children as Array<{ id: string }>;
  const idx = arr.findIndex((c) => c.id === overId);
  return { columnId: parent.id, index: idx >= 0 ? idx : arr.length };
}

export function EditorDndProvider({ children }: { children: ReactNode }) {
  const storeApi = useEditorStoreApi();
  const dispatch = useEditorStore((s) => s.dispatch);
  const select = useEditorStore((s) => s.select);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const [activeId, setActiveId] = useState<string | null>(null);
  const registry = getRegistry();

  const overlayLabel = useMemo(() => {
    if (!activeId) return null;
    if (activeId.startsWith(PALETTE_PREFIX)) {
      const type = activeId.slice(PALETTE_PREFIX.length);
      return registry.get(type)?.name ?? type;
    }
    const found = findNode(storeApi.getState().doc, activeId);
    const node = found?.node as { name?: string; type?: string } | undefined;
    return node?.name ?? node?.type?.replace('block.', '') ?? activeId;
  }, [activeId, registry, storeApi]);

  function onDragStart(ev: DragStartEvent) {
    setActiveId(String(ev.active.id));
  }

  function onDragEnd(ev: DragEndEvent) {
    setActiveId(null);
    const { active, over } = ev;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    if (activeIdStr === overIdStr) return;

    const doc = storeApi.getState().doc;

    // Palette → insert into a column-shaped target. Resolve required.
    if (activeIdStr.startsWith(PALETTE_PREFIX)) {
      const target = resolveDrop(doc, overIdStr);
      if (!target) return;
      const type = activeIdStr.slice(PALETTE_PREFIX.length);
      const def = registry.get(type);
      if (!def) return;
      const block = makeBlockFromDef(def);
      dispatch('doc/insertBlock', {
        parentId: target.columnId,
        index: target.index,
        block,
      });
      select({ id: block.id, type: 'block' });
      return;
    }

    // Existing node being moved.
    const found = findNode(doc, activeIdStr);
    const node = found?.node as { type?: string } | undefined;
    if (!found) return;

    // --- Row / column reorder via Layers sortable ---
    // Rows and columns can only swap with same-kind siblings under the same
    // parent. The over-id is then a sibling node id (no gap/col prefix).
    if (node?.type === 'row' || node?.type === 'column') {
      const overFound = findNode(doc, overIdStr);
      if (!overFound?.parent) return;
      const overNode = overFound.node as { type?: string };
      if (overNode.type !== node.type) return; // only swap with same kind
      const sourceParent = found.parent as { id?: string };
      const targetParent = overFound.parent as { id?: string; children?: Array<{ id: string }> };
      if (!targetParent.id || sourceParent.id !== targetParent.id) return; // same parent only
      if (!Array.isArray(targetParent.children)) return;
      const oldIdx = targetParent.children.findIndex((c) => c.id === activeIdStr);
      let newIdx = targetParent.children.findIndex((c) => c.id === overIdStr);
      if (oldIdx < 0 || newIdx < 0) return;
      if (oldIdx < newIdx) newIdx -= 1; // shift compensation
      dispatch('doc/move', {
        id: activeIdStr,
        newParentId: targetParent.id,
        newIndex: newIdx,
      });
      return;
    }

    if (node?.type?.startsWith('block.') !== true) return;

    // Block move — needs a column-shaped target.
    const target = resolveDrop(doc, overIdStr);
    if (!target) return;
    const parent = found.parent as { id?: string; children?: Array<{ id: string }> } | null;
    let newIndex = target.index;
    // Shift compensation is ONLY needed for gap drop targets, where the gap's
    // index points to "insert before what's currently at slot N" in the array
    // *as it is now*. After we remove the source from the same array, every
    // slot at-or-after `oldIdx` shifts up by one — so the destination index
    // must be decremented to land in the visually intended slot.
    //
    // For sortable sibling targets (over = a block id), dnd-kit's `arrayMove`
    // semantics already mean "place the dragged item where the target sits";
    // applying the shift would turn an intended downward move into a no-op.
    if (
      overIdStr.startsWith(GAP_PREFIX) &&
      parent?.id === target.columnId &&
      Array.isArray(parent.children)
    ) {
      const oldIdx = parent.children.findIndex((c) => c.id === activeIdStr);
      if (oldIdx >= 0 && oldIdx < newIndex) newIndex -= 1;
    }
    dispatch('doc/move', {
      id: activeIdStr,
      newParentId: target.columnId,
      newIndex,
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {overlayLabel ? <div className="lettera-drag-overlay">{overlayLabel}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
