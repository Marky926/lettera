/**
 * Compact-layout right panel — tabbed sidebar inspired by Unlayer-style
 * editors embedded in CRMs. While nothing is selected, four tabs expose
 * Content (blocks), Blocks (layout rows / sections), Body (document
 * settings) and Variables (host merge tags). When a node is selected, the
 * panel swaps to the existing `Inspector` with a close button that returns
 * to the previously active tab.
 */
import { useEffect, useState } from 'react';
import { getRegistry } from '../registry.js';
import { useEditorStore } from '../store/editorStore.js';
import { Inspector } from './Inspector.js';
import { Layers } from './Layers.js';
import { useVersionsPanel } from './LetteraEditor.js';
import { PaletteItem } from './Palette.js';
import { colFlex, ROW_PRESETS, usePaletteActions } from './usePaletteActions.js';
import { VariablesPanel } from './VariablesPanel.js';

type Tab = 'content' | 'blocks' | 'layers' | 'body' | 'variables' | 'versions';

const TABS: ReadonlyArray<{ id: Tab; label: string; icon: string }> = [
  { id: 'content', label: 'Content', icon: '▦' },
  { id: 'blocks', label: 'Blocks', icon: '▤' },
  { id: 'layers', label: 'Layers', icon: '☰' },
  { id: 'body', label: 'Body', icon: '⚙' },
  { id: 'variables', label: 'Vars', icon: '{·}' },
  { id: 'versions', label: 'Versions', icon: '↺' },
];

export function RightPanel() {
  const selection = useEditorStore((s) => s.selection);
  const variables = useEditorStore((s) => s.variables);
  const versionsPanel = useVersionsPanel();
  const [activeTab, setActiveTab] = useState<Tab>('content');
  const [lastTab, setLastTab] = useState<Tab>('content');
  /**
   * Local override — when the user explicitly closes the inspector via the
   * header ✕ we keep the underlying selection intact (so row/column presets
   * in the Blocks tab still target it) but hide the inspector UI. A new
   * selection (made via canvas click) clears this override automatically.
   */
  const [hideInspector, setHideInspector] = useState(false);

  // Remember the tab that was visible right before a selection happened so
  // closing the inspector restores it (matches typical CRM-editor UX).
  useEffect(() => {
    if (!selection) setLastTab(activeTab);
  }, [selection, activeTab]);

  // When the selection changes (e.g. user picks a different block on the
  // canvas) re-open the inspector so the property panel follows the user.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only react to selection id
  useEffect(() => {
    setHideInspector(false);
  }, [selection?.id]);

  const visibleTabs = TABS.filter((t) => {
    if (t.id === 'variables') return variables.length > 0;
    if (t.id === 'versions') return versionsPanel != null;
    return true;
  });

  const showInspector = selection != null && !hideInspector;

  return (
    <div className="lettera-right-panel">
      <div className="lettera-right-panel__main">
        {showInspector ? (
          <div className="lettera-right-panel__inspector">
            <header className="lettera-right-panel__header">
              <span>Properties</span>
              <button
                type="button"
                className="lettera-right-panel__close"
                aria-label="Close inspector"
                title="Close inspector (selection kept)"
                onClick={() => {
                  // Hide the inspector but keep selection so Blocks-tab
                  // presets (rows / columns) still target the same section.
                  setHideInspector(true);
                  setActiveTab(lastTab);
                }}
              >
                ✕
              </button>
            </header>
            <div className="lettera-right-panel__inspector-body">
              <Inspector />
            </div>
          </div>
        ) : (
          <div className="lettera-right-panel__tab-body">
            {activeTab === 'content' && <ContentTab />}
            {activeTab === 'blocks' && <BlocksTab />}
            {activeTab === 'layers' && (
              <div className="lettera-editor__panel">
                <Layers />
              </div>
            )}
            {activeTab === 'body' && (
              <div className="lettera-editor__panel lettera-editor__inspector">
                <Inspector />
              </div>
            )}
            {activeTab === 'variables' && <VariablesPanel />}
            {activeTab === 'versions' && (
              <div className="lettera-editor__panel">{versionsPanel}</div>
            )}
          </div>
        )}
      </div>
      {!showInspector && (
        <nav className="lettera-right-panel__rail" role="tablist" aria-label="Right panel tabs">
          {selection && (
            <button
              type="button"
              className="lettera-right-panel__rail-btn lettera-right-panel__rail-btn--reopen"
              onClick={() => setHideInspector(false)}
              title="Open inspector for the current selection"
            >
              <span className="lettera-right-panel__rail-icon" aria-hidden>
                ⚙
              </span>
              <span className="lettera-right-panel__rail-label">Selected</span>
            </button>
          )}
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              aria-controls={`lettera-tab-${t.id}`}
              className="lettera-right-panel__rail-btn"
              onClick={() => setActiveTab(t.id)}
              title={t.label}
            >
              <span className="lettera-right-panel__rail-icon" aria-hidden>
                {t.icon}
              </span>
              <span className="lettera-right-panel__rail-label">{t.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

function ContentTab() {
  const defs = getRegistry().list();
  const { insertBlock } = usePaletteActions();
  return (
    <div className="lettera-editor__panel">
      <h2>Content</h2>
      <div className="lettera-right-panel__tiles">
        {defs.map((def) => (
          <PaletteItem
            key={def.type}
            type={def.type}
            name={def.name}
            className="lettera-right-panel__tile"
            onClick={() => insertBlock(def.type, def.defaultProps)}
          >
            <span className="lettera-right-panel__tile-icon" aria-hidden>
              {iconFor(def.type)}
            </span>
            <span className="lettera-right-panel__tile-label">{def.name}</span>
          </PaletteItem>
        ))}
      </div>
    </div>
  );
}

function BlocksTab() {
  const { insertRow, insertSection } = usePaletteActions();
  return (
    <div className="lettera-editor__panel">
      <h2>Layout</h2>
      <div className="lettera-right-panel__tiles">
        {ROW_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="lettera-right-panel__tile lettera-right-panel__tile--clickable"
            title={`Insert a row with ${p.columns.length} column(s)`}
            onClick={() => insertRow(p.columns)}
          >
            <span className="lettera-row-glyph" aria-hidden>
              {p.columns.map((w, i) => (
                <span key={i} className="lettera-row-glyph__cell" style={{ flex: colFlex(w) }} />
              ))}
            </span>
            <span className="lettera-right-panel__tile-label">{p.label}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="lettera-editor__btn"
        style={{ width: '100%', marginTop: 8 }}
        onClick={insertSection}
      >
        + Section
      </button>
    </div>
  );
}

function iconFor(type: string): string {
  if (type.includes('heading')) return 'H';
  if (type.includes('text')) return '¶';
  if (type.includes('button')) return '▭';
  if (type.includes('image')) return '🖼';
  if (type.includes('divider')) return '━';
  if (type.includes('spacer')) return '↕';
  if (type.includes('html')) return '</>';
  return '◻';
}
