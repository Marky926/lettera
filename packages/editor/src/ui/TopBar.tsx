import { useEditorStore } from '../store/editorStore.js';

export function TopBar() {
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const device = useEditorStore((s) => s.device);
  const setDevice = useEditorStore((s) => s.setDevice);
  const doc = useEditorStore((s) => s.doc);
  const setCommandPaletteOpen = useEditorStore((s) => s.setCommandPaletteOpen);
  const setLayout = useEditorStore((s) => s.setLayout);

  return (
    <div className="lettera-editor__topbar">
      <h1>Lettera</h1>
      <span style={{ color: '#6b7280', fontSize: 12 }}>{doc.metadata.name ?? 'Untitled'}</span>
      <div className="lettera-editor__spacer" />
      <button
        type="button"
        className="lettera-editor__btn"
        onClick={() => setCommandPaletteOpen(true)}
        aria-label="Open command palette"
        title="Open command palette (⌘K)"
      >
        ⌘K
      </button>
      <span style={{ width: 12 }} />
      <button
        type="button"
        className="lettera-editor__btn"
        onClick={undo}
        disabled={!canUndo}
        aria-label="Undo"
      >
        Undo
      </button>
      <button
        type="button"
        className="lettera-editor__btn"
        onClick={redo}
        disabled={!canRedo}
        aria-label="Redo"
      >
        Redo
      </button>
      <span style={{ width: 12 }} />
      <button
        type="button"
        className="lettera-editor__btn lettera-editor__btn--toggle"
        aria-pressed={device === 'desktop'}
        onClick={() => setDevice('desktop')}
      >
        Desktop
      </button>
      <button
        type="button"
        className="lettera-editor__btn lettera-editor__btn--toggle"
        aria-pressed={device === 'mobile'}
        onClick={() => setDevice('mobile')}
      >
        Mobile
      </button>
      <span style={{ width: 12 }} />
      <button
        type="button"
        className="lettera-editor__btn"
        onClick={() => setLayout('compact')}
        title="Switch to compact layout (single right panel, like Unlayer)"
      >
        ☰ Compact
      </button>
    </div>
  );
}
