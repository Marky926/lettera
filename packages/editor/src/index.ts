/**
 * @lettera/editor
 *
 * React-based visual editor that wraps `@lettera/core`'s CommandBus and
 * `@lettera/renderer` for live preview. Framework-agnostic core logic lives
 * in `./store`; UI is plain React + a tiny CSS file (no Tailwind dependency
 * yet — keeps the package shell standalone).
 */

export type {
  PreviewResult,
  SaveContext,
  UsePersistenceOptions,
  UsePersistenceResult,
  UsePreviewOptions,
  UseVersionsOptions,
  UseVersionsResult,
  VersionEntry,
} from './hooks/index.js';
// Persistence / versioning / preview hooks. Re-exported for convenience;
// also available under the `@lettera/editor/hooks` subpath for tree-shaking.
export {
  usePersistence,
  usePreview,
  useVersions,
} from './hooks/index.js';
export { getRegistry, setRegistry } from './registry.js';
export type {
  EditorActions,
  EditorState,
  EditorStore,
  EditorStoreApi,
  Selection,
} from './store/editorStore.js';
export { createEditorStore, useEditorStore, useEditorStoreApi } from './store/editorStore.js';
export type { LetteraEditorProps, LetteraLayout } from './ui/LetteraEditor.js';
export { LetteraEditor } from './ui/LetteraEditor.js';
