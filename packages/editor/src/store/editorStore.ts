/**
 * Editor store (Zustand) wrapping a `CommandBus<EmailDocument>`.
 *
 * Components subscribe to `useEditorStore`. All mutations go through the bus
 * via `dispatch`, so undo/redo and coalescing keep working. Selection state
 * is held purely client-side (not part of the document).
 */

import {
  CommandBus,
  type EmailDocument,
  registerStandardCommands,
  type VariableContext,
  type VariableDefinition,
  type VariableSchema,
} from '@lettera/core';
import type { LintResult } from '@lettera/sdk';
import { createContext, useContext } from 'react';
import { createStore, type StoreApi, useStore } from 'zustand';

export interface Selection {
  id: string;
  type: 'section' | 'row' | 'column' | 'block';
}

export interface EditorState {
  doc: EmailDocument;
  selection: Selection | null;
  device: 'desktop' | 'mobile';
  /**
   * Visual shell currently rendered. Lives in the store so a topbar toggle
   * can flip between classic / compact at runtime without prop drilling.
   * `<LetteraEditor>` syncs its `layout` prop here on mount.
   */
  layout: 'classic' | 'compact';
  canUndo: boolean;
  canRedo: boolean;
  variables: readonly VariableDefinition[];
  /**
   * Optional typed variable schema (second-generation merge-tag model). When
   * present, the Variables panel renders a tree view; repeater / conditional
   * blocks use it to discover list sources. Coexists with the legacy flat
   * `variables` list — both can be populated simultaneously during migration.
   */
  schema?: VariableSchema;
  /** Sample / preview data for typed-schema substitution in the canvas. */
  data?: VariableContext;
  /** Latest renderer warnings, refreshed by the canvas. */
  warnings: readonly LintResult[];
  /** Whether the command palette overlay is open. */
  commandPaletteOpen: boolean;
  /**
   * Transient id hovered from the Layers panel (or any sibling UI). When
   * non-null the canvas draws a faint outline around the matching node so
   * users can preview what each layer row corresponds to. Not persisted
   * and not part of undo history.
   */
  hoverId: string | null;
}

export interface EditorActions {
  bus: CommandBus<EmailDocument>;
  dispatch<T>(type: string, payload: T): void;
  undo(): void;
  redo(): void;
  select(sel: Selection | null): void;
  setDevice(d: 'desktop' | 'mobile'): void;
  setLayout(l: 'classic' | 'compact'): void;
  loadDocument(doc: EmailDocument): void;
  setVariables(vars: readonly VariableDefinition[]): void;
  setSchema(schema: VariableSchema | undefined): void;
  setData(data: VariableContext | undefined): void;
  setWarnings(w: readonly LintResult[]): void;
  setCommandPaletteOpen(open: boolean): void;
  setHoverId(id: string | null): void;
}

export type EditorStore = EditorState & EditorActions;

export type EditorStoreApi = StoreApi<EditorStore>;

/**
 * Create a fresh editor store bound to its own command bus. Each editor
 * instance should have its own store so multi-instance apps don't collide.
 */
export function createEditorStore(initialDoc: EmailDocument): EditorStoreApi {
  return createStore<EditorStore>((set) => {
    const bus = new CommandBus<EmailDocument>(initialDoc);
    registerStandardCommands(bus);
    bus.subscribe((doc) => {
      set({ doc, canUndo: bus.canUndo(), canRedo: bus.canRedo() });
    });

    return {
      doc: bus.getState(),
      selection: null,
      device: 'desktop',
      layout: 'classic',
      canUndo: false,
      canRedo: false,
      variables: [],
      warnings: [],
      commandPaletteOpen: false,
      hoverId: null,
      bus,
      dispatch: (type, payload) => bus.dispatch(type, payload),
      undo: () => bus.undo(),
      redo: () => bus.redo(),
      select: (sel) => set({ selection: sel }),
      setDevice: (d) => set({ device: d }),
      setLayout: (l) => set({ layout: l }),
      loadDocument: (doc) => {
        bus.replaceState(doc);
        set({ doc, selection: null, canUndo: false, canRedo: false });
      },
      setVariables: (vars) => set({ variables: vars }),
      setSchema: (schema) => set({ schema }),
      setData: (data) => set({ data }),
      setWarnings: (w) => set({ warnings: w }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      setHoverId: (id) => set({ hoverId: id }),
    };
  });
}

// Module-level default store for apps that only ever have one editor.
let defaultStore: EditorStoreApi | null = null;

/**
 * React Context carrying the editor store for the current `<LetteraEditor />`
 * subtree. This is the preferred mechanism: multiple editor instances on the
 * same page each get their own store without collisions. The module-level
 * `defaultStore` remains as a backward-compatible fallback for callers that
 * use the re-exported `useEditorStore` from outside a provider.
 */
export const EditorStoreContext = createContext<EditorStoreApi | null>(null);

interface UseEditorStoreFn {
  <T>(selector: (s: EditorStore) => T): T;
  setStore(s: EditorStoreApi): void;
  getStore(): EditorStoreApi | null;
}

function useResolvedStore(): EditorStoreApi {
  // `useContext` must be called unconditionally; the context is read first,
  // then we fall back to the singleton for legacy callers.
  const ctx = useContext(EditorStoreContext);
  const store = ctx ?? defaultStore;
  if (!store) {
    throw new Error(
      '[lettera/editor] useEditorStore was called before <LetteraEditor /> mounted. ' +
        'Render the editor first, or build your own store via createEditorStore().',
    );
  }
  return store;
}

function useEditorStoreImpl<T>(selector: (s: EditorStore) => T): T {
  const store = useResolvedStore();
  return useStore(store, selector);
}

export const useEditorStore: UseEditorStoreFn = Object.assign(useEditorStoreImpl, {
  setStore(s: EditorStoreApi) {
    defaultStore = s;
  },
  getStore(): EditorStoreApi | null {
    return defaultStore;
  },
});

/**
 * Returns the current store API handle. Use this when you need imperative
 * access to `getState()` / `setState()` inside callbacks (DnD, async work)
 * without subscribing the component to store changes. Always returns the
 * provider-bound store when inside `<LetteraEditor />`; otherwise falls back
 * to the module-level default.
 */
export function useEditorStoreApi(): EditorStoreApi {
  return useResolvedStore();
}
