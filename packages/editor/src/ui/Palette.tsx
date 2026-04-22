import { useDraggable } from '@dnd-kit/core';
import type { ReactNode } from 'react';
import { getRegistry } from '../registry.js';
import { PALETTE_PREFIX } from './DndProvider.js';
import { colFlex, ROW_PRESETS, usePaletteActions } from './usePaletteActions.js';

export function Palette() {
  const registry = getRegistry();
  const defs = registry.list();
  const { insertBlock, insertRow, insertSection } = usePaletteActions();

  return (
    <div className="lettera-editor__panel lettera-editor__palette-host">
      <h2>Layout</h2>
      <div className="lettera-editor__palette">
        {ROW_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            title={`Insert a row with ${p.columns.length} column(s)`}
            onClick={() => insertRow(p.columns)}
          >
            <span className="lettera-row-glyph" aria-hidden>
              {p.columns.map((w, i) => (
                <span key={i} className="lettera-row-glyph__cell" style={{ flex: colFlex(w) }} />
              ))}
            </span>
            {p.label}
          </button>
        ))}
        <button
          type="button"
          title="Insert a new section"
          onClick={insertSection}
          style={{ gridColumn: '1 / -1' }}
        >
          + Section
        </button>
      </div>

      <h2 style={{ marginTop: 16 }}>Blocks</h2>
      <div className="lettera-editor__palette">
        {defs.map((def) => (
          <PaletteItem
            key={def.type}
            type={def.type}
            name={def.name}
            onClick={() => insertBlock(def.type, def.defaultProps)}
          />
        ))}
      </div>
    </div>
  );
}

interface PaletteItemProps {
  type: string;
  name: string;
  onClick(): void;
  children?: ReactNode;
  className?: string;
}

export function PaletteItem({ type, name, onClick, children, className }: PaletteItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${PALETTE_PREFIX}${type}`,
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      title={`${name} â€” drag onto canvas or click to append`}
      onClick={onClick}
      className={className}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      {...listeners}
      {...attributes}
    >
      {children ?? <>+ {name}</>}
    </button>
  );
}
