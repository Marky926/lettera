/**
 * Layers panel.
 *
 * Drag/drop is owned by the editor-wide `EditorDndProvider`. This component
 * just declares:
 *   - a SortableContext spanning every block id (so cross-column drags are
 *     allowed; the drop handler in DndProvider validates the target),
 *   - a `useDroppable` "col:<id>" target for each column row, so empty
 *     columns can still receive drops.
 */

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Block, Column, EmailDocument, Row, Section } from '@lettera/core';
import { Fragment, useMemo } from 'react';
import { type Selection, useEditorStore } from '../store/editorStore.js';
import { COLUMN_PREFIX } from './DndProvider.js';

interface Item {
  id: string;
  label: string;
  type: Selection['type'];
  depth: number;
  columnId?: string;
  /** True for blocks that own their own children array (repeater/conditional). */
  isContainer?: boolean;
}

function flatten(doc: EmailDocument): Item[] {
  const out: Item[] = [];
  const pushBlock = (b: Block, depth: number, columnId: string): void => {
    const isContainer = b.type === 'block.repeater' || b.type === 'block.conditional';
    out.push({
      id: b.id,
      label: b.name ?? b.type.replace('block.', ''),
      type: 'block',
      depth,
      columnId,
      isContainer,
    });
    // Container blocks expose their children as nested layer rows so users
    // can target them for selection and drop.
    if (b.type === 'block.repeater') {
      for (const child of b.children ?? []) pushBlock(child, depth + 1, b.id);
    } else if (b.type === 'block.conditional') {
      for (const child of b.children ?? []) pushBlock(child, depth + 1, b.id);
      for (const child of b.else ?? []) pushBlock(child, depth + 1, b.id);
    }
  };
  doc.root.forEach((s: Section, si) => {
    out.push({ id: s.id, label: s.name ?? `Section ${si + 1}`, type: 'section', depth: 0 });
    s.children.forEach((r: Row, ri) => {
      out.push({ id: r.id, label: r.name ?? `Row ${ri + 1}`, type: 'row', depth: 1 });
      r.children.forEach((c: Column, ci) => {
        out.push({
          id: c.id,
          label: c.name ?? `Column ${ci + 1} (${c.props.width})`,
          type: 'column',
          depth: 2,
        });
        c.children.forEach((b: Block) => {
          pushBlock(b, 3, c.id);
        });
      });
    });
  });
  return out;
}

interface RowProps {
  item: Item;
  selected: boolean;
  onSelect(): void;
  onHover(id: string | null): void;
  onDelete?(): void;
}

function LayerRow({ item, selected, onSelect, onHover, onDelete }: RowProps) {
  // Block, row and column rows are all sortable. Sections aren't (typically
  // a doc has a single section, and section reorder is rarely useful).
  const sortable = useSortable({
    id: item.id,
    disabled: item.type === 'section',
  });
  // Columns AND container blocks (repeater/conditional) act as drop targets
  // so new blocks can be dropped straight into their children array.
  const isDropTarget = item.type === 'column' || item.isContainer === true;
  const droppable = useDroppable({
    id: `${COLUMN_PREFIX}${item.id}`,
    disabled: !isDropTarget,
  });

  const setRef = (node: HTMLLIElement | null) => {
    sortable.setNodeRef(node);
    if (isDropTarget) droppable.setNodeRef(node);
  };

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : 1,
    background: isDropTarget && droppable.isOver ? 'rgba(31,111,235,0.12)' : undefined,
  };

  return (
    <li
      ref={setRef}
      style={style}
      aria-selected={selected}
      onClick={onSelect}
      onPointerEnter={() => onHover(item.id)}
      onPointerLeave={() => onHover(null)}
      {...sortable.attributes}
      {...(item.type !== 'section' ? sortable.listeners : {})}
    >
      {Array.from({ length: item.depth }).map((_, i) => (
        <Fragment key={i}>
          <span className="indent" />
        </Fragment>
      ))}
      <span style={{ flex: 1 }}>{item.label}</span>
      <span className="badge">{item.type}</span>
      {onDelete && (
        <button
          type="button"
          title="Delete"
          aria-label="Delete"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: 0,
            fontSize: 12,
            color: '#9ca3af',
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          ×
        </button>
      )}
    </li>
  );
}

export function Layers() {
  const doc = useEditorStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const dispatch = useEditorStore((s) => s.dispatch);
  const setHoverId = useEditorStore((s) => s.setHoverId);

  const items = useMemo(() => flatten(doc), [doc]);
  // Every non-section id is sortable. Cross-kind drops are validated in the
  // editor-wide DnD provider so a section doesn't accidentally swap with a
  // block, etc.
  const sortableIds = useMemo(
    () => items.filter((i) => i.type !== 'section').map((i) => i.id),
    [items],
  );

  return (
    <div className="lettera-editor__panel lettera-editor__layers">
      <h2>Layers</h2>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <ul onPointerLeave={() => setHoverId(null)}>
          {items.map((it) => (
            <LayerRow
              key={it.id}
              item={it}
              selected={selection?.id === it.id}
              onSelect={() => select({ id: it.id, type: it.type })}
              onHover={setHoverId}
              onDelete={
                it.type === 'block'
                  ? () => {
                      dispatch('doc/remove', { id: it.id });
                      if (selection?.id === it.id) select(null);
                    }
                  : undefined
              }
            />
          ))}
        </ul>
      </SortableContext>
    </div>
  );
}
