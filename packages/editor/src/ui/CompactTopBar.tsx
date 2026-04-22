/**
 * Slim top bar for the compact layout. Mirrors the screenshot from the
 * user's CRM integration: device toggle in the centre, preview eye on the
 * right, undo/redo as icon buttons on the left, plus ⌘K for the command
 * palette (where Layers / Linter / other tools live).
 */
import { useEditorStore } from '../store/editorStore.js';
import { useBreadcrumbs } from './LetteraEditor.js';

export function CompactTopBar() {
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const device = useEditorStore((s) => s.device);
  const setDevice = useEditorStore((s) => s.setDevice);
  const doc = useEditorStore((s) => s.doc);
  const setCommandPaletteOpen = useEditorStore((s) => s.setCommandPaletteOpen);
  const setLayout = useEditorStore((s) => s.setLayout);
  const breadcrumbs = useBreadcrumbs();

  return (
    <div className="lettera-editor__topbar lettera-editor__topbar--compact">
      {breadcrumbs ? (
        <div className="lettera-editor__breadcrumbs">{breadcrumbs}</div>
      ) : (
        <h1>{doc.metadata.name ?? 'Untitled'}</h1>
      )}
      <div className="lettera-editor__spacer" />

      <div className="lettera-compact-device" role="group" aria-label="Device preview">
        <button
          type="button"
          className="lettera-editor__btn lettera-editor__btn--toggle"
          aria-pressed={device === 'desktop'}
          onClick={() => setDevice('desktop')}
          title="Desktop"
        >
          🖥
        </button>
        <button
          type="button"
          className="lettera-editor__btn lettera-editor__btn--toggle"
          aria-pressed={device === 'mobile'}
          onClick={() => setDevice('mobile')}
          title="Mobile"
        >
          📱
        </button>
      </div>

      <div className="lettera-editor__spacer" />

      <button
        type="button"
        className="lettera-editor__btn"
        onClick={undo}
        disabled={!canUndo}
        aria-label="Undo"
        title="Undo (⌘Z)"
      >
        ↶
      </button>
      <button
        type="button"
        className="lettera-editor__btn"
        onClick={redo}
        disabled={!canRedo}
        aria-label="Redo"
        title="Redo (⇧⌘Z)"
      >
        ↷
      </button>
      <button
        type="button"
        className="lettera-editor__btn"
        onClick={() => setCommandPaletteOpen(true)}
        aria-label="Open command palette"
        title="Command palette (⌘K) — find Layers, Linter, etc."
      >
        ⌘K
      </button>
      <button
        type="button"
        className="lettera-editor__btn"
        onClick={() => setLayout('classic')}
        aria-label="Switch to classic layout"
        title="Classic layout (left palette + right inspector)"
      >
        ⊞ Classic
      </button>
    </div>
  );
}
