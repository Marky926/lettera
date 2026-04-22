import type {
  EmailDocument,
  VariableContext,
  VariableDefinition,
  VariableSchema,
} from '@lettera/core';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useStore } from 'zustand';
import { usePersistence } from '../hooks/usePersistence.js';
import {
  createEditorStore,
  type EditorStoreApi,
  EditorStoreContext,
  useEditorStore,
  useEditorStoreApi,
} from '../store/editorStore.js';
import { Canvas } from './Canvas.js';
import { CommandPalette } from './CommandPalette.js';
import { CompactTopBar } from './CompactTopBar.js';
import { EditorDndProvider } from './DndProvider.js';
import { Inspector } from './Inspector.js';
import { Layers } from './Layers.js';
import { LinterPanel } from './LinterPanel.js';
import { Palette } from './Palette.js';
import { RightPanel } from './RightPanel.js';
import { TopBar } from './TopBar.js';
import { VariablesPanel } from './VariablesPanel.js';

/**
 * Visual layout variant.
 *
 * - `'classic'` (default): three-pane shell with left palette/layers,
 *   centre canvas, right inspector and bottom linter strip. Best for
 *   stand-alone power users.
 * - `'compact'`: Unlayer-style shell that fits inside a CRM/SaaS modal â€”
 *   slim header, canvas + a single right tabbed panel
 *   (Content / Blocks / Body / Variables). When a node is selected the
 *   right panel swaps to the property inspector.
 */
export type LetteraLayout = 'classic' | 'compact';

export interface LetteraEditorProps {
  /**
   * Document to render. Required.
   *
   * When the prop reference changes after mount the editor calls
   * `loadDocument()` internally to reconcile the store; it does **not**
   * remount. This preserves undo history and the current selection,
   * which is usually what you want for autosave round-trips.
   *
   * To force a hard reset (clear undo history, drop selection) — for
   * example when switching between templates in a multi-tenant CRM —
   * use a React `key`:
   *
   * ```tsx
   * <LetteraEditor key={templateId} document={doc} />
   * ```
   */
  document: EmailDocument;
  /**
   * Variables (merge tags) supplied by the host system. They appear in the
   * Variables panel and can be inserted into rich-text fields as inline chips.
   * The renderer substitutes them at export time.
   */
  variables?: readonly VariableDefinition[];
  /**
   * Typed variable schema (second-generation merge-tag model). When provided
   * alongside `variables`, the Variables panel renders a tree view and the
   * repeater block can discover list sources. `data` supplies the concrete
   * values used for the canvas preview.
   */
  schema?: VariableSchema;
  /** Runtime data bound to the typed schema for preview rendering. */
  data?: VariableContext;
  /** Optional store override (advanced; for SSR or external sync). */
  store?: EditorStoreApi;
  /**
   * Slot rendered as a "Versions" tab inside the compact right panel. Lets
   * the host app (e.g. the Next.js document page) inject its own version-
   * history UI without coupling the editor package to react-query or any
   * particular API client. Hidden when not provided.
   */
  versionsPanel?: ReactNode;
  /**
   * Visual shell to render. Defaults to `'classic'`. Both shells share the
   * same store + command bus.
   */
  layout?: LetteraLayout;
  /**
   * Called synchronously on every command-bus mutation with the latest
   * document — i.e. potentially on every keystroke. **Not debounced.**
   * Use for dirty-state tracking, analytics, or live mirroring; if your
   * handler is expensive, debounce inside it. For autosave prefer
   * `onSave` + `autosaveDelay` (debounced).
   */
  onDocumentChange?(doc: EmailDocument): void;
  /**
   * Persistence callback. When supplied, the editor mounts an internal
   * `usePersistence` loop that debounces document mutations by
   * `autosaveDelay` ms (default 1500) and calls `onSave` with the latest
   * document plus a `SaveContext` whose `signal` aborts when a newer save
   * supersedes the current one. Returning a rejected promise routes the
   * error to `onSaveError`.
   *
   * For full control (manual flush, snapshot/restore choreography), call
   * the `usePersistence` hook from your own component instead and leave
   * this prop unset.
   */
  onSave?(doc: EmailDocument, context: { signal: AbortSignal }): Promise<void> | void;
  /** Debounce delay for `onSave`, in **milliseconds**. Defaults to 1500. */
  autosaveDelay?: number;
  /**
   * Called when `onSave` rejects. Highly recommended in production:
   * without it, save failures are swallowed so the autosave loop can
   * keep trying, and your users see no indication that their edits
   * aren't reaching the server.
   */
  onSaveError?(error: Error): void;
}

/**
 * Internal context exposing the host-supplied versions slot to deep
 * descendants (RightPanel) without prop drilling.
 */
const VersionsPanelContext = createContext<ReactNode | null>(null);

export function useVersionsPanel(): ReactNode | null {
  return useContext(VersionsPanelContext);
}

/**
 * Mounts the editor store, registers it as the default singleton (so the
 * `useEditorStore` re-export works for app code), and renders the requested
 * shell.
 */
export function LetteraEditor({
  document,
  variables,
  schema,
  data,
  store,
  versionsPanel,
  layout = 'classic',
  onDocumentChange,
  onSave,
  autosaveDelay,
  onSaveError,
}: LetteraEditorProps) {
  const initialDocRef = useRef<EmailDocument>(document);
  const initialLayoutRef = useRef<LetteraLayout>(layout);
  // Bind the store synchronously during render so child components can call
  // `useEditorStore` on their very first render. Re-runs only when `store` changes.
  const created = useMemo<EditorStoreApi>(() => {
    const s = store ?? createEditorStore(initialDocRef.current);
    // Seed the store's layout from the prop on first creation. The prop is
    // treated as an *initial* value only; after mount the in-store layout
    // (flipped by the topbar toggle) is the source of truth and the prop is
    // deliberately NOT synced back into the store — that would clobber any
    // runtime toggle whenever the host re-renders the editor.
    s.getState().setLayout(initialLayoutRef.current);
    useEditorStore.setStore(s);
    return s;
  }, [store]);

  // If a new document is passed in after mount, replay it through the bus.
  useEffect(() => {
    if (document !== initialDocRef.current) {
      created.getState().loadDocument(document);
      initialDocRef.current = document;
    }
  }, [document, created]);

  // Push variables into the store whenever the prop changes.
  useEffect(() => {
    created.getState().setVariables(variables ?? []);
  }, [variables, created]);

  useEffect(() => {
    created.getState().setSchema(schema);
  }, [schema, created]);

  useEffect(() => {
    created.getState().setData(data);
  }, [data, created]);

  // Subscribe to the live layout from the *exact* store we created, not via
  // the `useEditorStore` hook — that hook reads context first and falls
  // back to the module-level default singleton. Since this very component
  // is rendered *above* its own EditorStoreContext.Provider, its context
  // lookup would miss, and in React StrictMode (which invokes useMemo
  // twice in dev) the module-level default can briefly diverge from the
  // store handed to the provider. That subtle mismatch would break the
  // Classic/Compact toggle: the topbar would mutate the context store
  // while this component stayed subscribed to the default store.
  const liveLayout = useStore(created, (s) => s.layout);

  const className =
    liveLayout === 'compact'
      ? 'lettera-editor lettera-editor--compact'
      : 'lettera-editor lettera-editor--classic';

  return (
    <div className={className} role="application" aria-label="Lettera email editor">
      <EditorStoreContext.Provider value={created}>
        <VersionsPanelContext.Provider value={versionsPanel ?? null}>
          {onDocumentChange ? <DocumentChangeBridge onChange={onDocumentChange} /> : null}
          {onSave ? (
            <PersistenceBridge
              onSave={onSave}
              autosaveDelay={autosaveDelay}
              onSaveError={onSaveError}
            />
          ) : null}
          <EditorDndProvider>
            {liveLayout === 'compact' ? <CompactShell /> : <ClassicShell />}
          </EditorDndProvider>
          <CommandPalette />
        </VersionsPanelContext.Provider>
      </EditorStoreContext.Provider>
    </div>
  );
}

function ClassicShell() {
  const versionsPanel = useVersionsPanel();
  return (
    <>
      <TopBar />
      <aside className="lettera-editor__sidebar">
        <Palette />
        <VariablesPanel />
        <Layers />
      </aside>
      <PanelSplitter side="left" />
      <Canvas />
      <PanelSplitter side="right" />
      <aside className="lettera-editor__sidebar lettera-editor__sidebar--right">
        <Inspector />
        {versionsPanel ? (
          <div className="lettera-editor__panel lettera-editor__versions-panel">
            <h2>Versions</h2>
            {versionsPanel}
          </div>
        ) : null}
      </aside>
      <LinterPanel />
    </>
  );
}

function CompactShell() {
  return (
    <>
      <CompactTopBar />
      <Canvas />
      <aside className="lettera-editor__sidebar lettera-editor__sidebar--right lettera-editor__sidebar--compact">
        <RightPanel />
      </aside>
    </>
  );
}

/**
 * Drag-to-resize handle for the left or right sidebar. Persists width to
 * localStorage and clamps to a sensible range. Width is stored on
 * `documentElement` as a CSS variable so layout is driven entirely by CSS.
 */
function PanelSplitter({ side }: { side: 'left' | 'right' }) {
  const cssVar = side === 'left' ? '--lettera-left-w' : '--lettera-right-w';
  const storageKey = side === 'left' ? 'lettera.panel.left' : 'lettera.panel.right';
  const MIN = 200;
  const MAX = 600;

  // On mount, restore saved width.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      const n = saved == null ? NaN : Number(saved);
      if (Number.isFinite(n) && n >= MIN && n <= MAX) {
        document.documentElement.style.setProperty(cssVar, `${n}px`);
      }
    } catch {
      /* ignore */
    }
  }, [cssVar, storageKey]);

  const onPointerDown = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>) => {
      ev.preventDefault();
      const startX = ev.clientX;
      const root = document.documentElement;
      const startWidth = parseFloat(
        getComputedStyle(root).getPropertyValue(cssVar).trim() || (side === 'left' ? '280' : '320'),
      );
      const target = ev.currentTarget;
      target.setPointerCapture(ev.pointerId);
      target.dataset.dragging = 'true';

      function move(e: PointerEvent) {
        const delta = e.clientX - startX;
        const next = side === 'left' ? startWidth + delta : startWidth - delta;
        const clamped = Math.max(MIN, Math.min(MAX, next));
        root.style.setProperty(cssVar, `${clamped}px`);
      }
      function up() {
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', up);
        delete target.dataset.dragging;
        try {
          const cur = parseFloat(getComputedStyle(root).getPropertyValue(cssVar).trim() || '0');
          if (Number.isFinite(cur) && cur > 0) {
            window.localStorage.setItem(storageKey, String(Math.round(cur)));
          }
        } catch {
          /* ignore */
        }
      }
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', up);
    },
    [cssVar, side, storageKey],
  );

  return (
    <div
      className={`lettera-splitter lettera-splitter--${side}`}
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
    />
  );
}

/**
 * Mirrors every store-level document mutation back to the host through the
 * `onDocumentChange` prop. Mounted invisibly inside the store provider so
 * it has access to the same store the editor uses.
 */
function DocumentChangeBridge({ onChange }: { onChange: (doc: EmailDocument) => void }) {
  const storeApi = useEditorStoreApi();
  const cbRef = useRef(onChange);
  cbRef.current = onChange;
  useEffect(() => {
    return storeApi.subscribe((state, prev) => {
      if (state.doc !== prev.doc) cbRef.current(state.doc);
    });
  }, [storeApi]);
  return null;
}

/**
 * Mounts the `usePersistence` hook on the editor's behalf when the host
 * supplies an `onSave` prop. Hosts that need finer control (manual flush,
 * snapshot/restore choreography) should call `usePersistence` themselves
 * and omit the prop.
 */
function PersistenceBridge({
  onSave,
  autosaveDelay,
  onSaveError,
}: {
  onSave: NonNullable<LetteraEditorProps['onSave']>;
  autosaveDelay?: number;
  onSaveError?: (err: Error) => void;
}) {
  usePersistence({ onSave, autosaveDelay, onSaveError });
  return null;
}
