/**
 * Persistence + versioning + preview hooks for `<LetteraEditor>`.
 *
 * These hooks live in their own subpath so they can be tree-shaken away
 * by hosts that only need the editor component (e.g. read-only preview
 * apps, Storybook stories).
 *
 * @example
 * ```tsx
 * import { LetteraEditor } from '@lettera/editor';
 * import { usePersistence, useVersions } from '@lettera/editor/hooks';
 * ```
 */

export { usePersistence } from './usePersistence.js';
export type {
  SaveContext,
  UsePersistenceOptions,
  UsePersistenceResult,
} from './usePersistence.js';
export { useVersions } from './useVersions.js';
export type { UseVersionsOptions, UseVersionsResult, VersionEntry } from './useVersions.js';
export { usePreview } from './usePreview.js';
export type { PreviewResult, UsePreviewOptions } from './usePreview.js';
