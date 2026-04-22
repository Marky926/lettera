/**
 * useVersions — version-history glue for the editor.
 *
 * Wraps host-supplied REST/GraphQL calls (snapshot, list, restore) with
 * the boilerplate that's universal: invalidate after writes, push the
 * restored content into the editor store, prevent autosave from
 * clobbering the restored doc.
 *
 * The hook does NOT do data fetching itself — pass three async callbacks
 * that talk to your backend. It returns memoised actions and the latest
 * version list.
 *
 * Use it together with `usePersistence` so that:
 *   1. Snapshot waits for the in-flight autosave to complete (the
 *      snapshot reflects what's on screen, not a half-saved doc).
 *   2. Restore cancels any pending autosave so the just-loaded doc
 *      isn't immediately overwritten.
 *
 * Example:
 *
 * ```tsx
 * const persistence = usePersistence({ onSave });
 * const versions = useVersions({
 *   onListVersions: () => api(`/templates/${id}/versions`),
 *   onSnapshot: async (doc, label) => {
 *     await persistence.flush(); // ensure latest edits are saved first
 *     return api(`/templates/${id}/versions`, { method: 'POST',
 *       body: JSON.stringify({ label, content: doc }) });
 *   },
 *   onRestore: async (vid) => {
 *     persistence.cancel(); // prevent autosave from clobbering
 *     return api(`/templates/${id}/versions/${vid}/restore`,
 *       { method: 'POST' }).then(r => r.content);
 *   },
 * });
 * ```
 */

import type { EmailDocument } from '@lettera/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStoreApi } from '../store/editorStore.js';

/**
 * Minimal version-history entry shape. Hosts may extend with extra fields
 * (author, label, …); this is the structural shape the hook needs.
 */
export interface VersionEntry {
  id: string;
  label?: string | null;
  createdAt: string;
  [extra: string]: unknown;
}

export interface UseVersionsOptions {
  /** Fetch the version list. Called once on mount and after every write. */
  onListVersions(): Promise<VersionEntry[]>;
  /** Persist the current document as a labelled snapshot. */
  onSnapshot(doc: EmailDocument, label: string): Promise<VersionEntry>;
  /**
   * Restore a previous version. Must return the full document (not just an
   * id) so the hook can push it back into the editor store atomically.
   */
  onRestore(versionId: string): Promise<EmailDocument>;
  /** Optional: run on any list/snapshot/restore failure. */
  onError?(error: Error, op: 'list' | 'snapshot' | 'restore'): void;
  /** Skip the initial list fetch (handy when the list is server-streamed). */
  skipInitialFetch?: boolean;
}

export interface UseVersionsResult {
  /** Latest known version list. Empty array until the first fetch resolves. */
  versions: VersionEntry[];
  /** True while any of list/snapshot/restore is in flight. */
  loading: boolean;
  /** Manually re-fetch the list. */
  refresh(): Promise<void>;
  /** Persist the current store doc as a snapshot with the given label. */
  createSnapshot(label: string): Promise<VersionEntry | null>;
  /** Restore a previous version into the editor. */
  restore(versionId: string): Promise<void>;
}

export function useVersions(options: UseVersionsOptions): UseVersionsResult {
  const storeApi = useEditorStoreApi();
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const optsRef = useRef(options);
  optsRef.current = options;
  const unmountedRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await optsRef.current.onListVersions();
      if (!unmountedRef.current) setVersions(next);
    } catch (err) {
      optsRef.current.onError?.(err instanceof Error ? err : new Error(String(err)), 'list');
    } finally {
      if (!unmountedRef.current) setLoading(false);
    }
  }, []);

  const createSnapshot = useCallback(
    async (label: string): Promise<VersionEntry | null> => {
      setLoading(true);
      try {
        const doc = storeApi.getState().doc;
        const entry = await optsRef.current.onSnapshot(doc, label);
        if (!unmountedRef.current) {
          setVersions((prev) => [entry, ...prev]);
        }
        return entry;
      } catch (err) {
        optsRef.current.onError?.(err instanceof Error ? err : new Error(String(err)), 'snapshot');
        return null;
      } finally {
        if (!unmountedRef.current) setLoading(false);
      }
    },
    [storeApi],
  );

  const restore = useCallback(
    async (versionId: string): Promise<void> => {
      setLoading(true);
      try {
        const doc = await optsRef.current.onRestore(versionId);
        // Push the restored content into the store. `loadDocument` resets
        // selection and undo history, matching the user's expectation that
        // "restore" is a hard jump rather than another undoable command.
        storeApi.getState().loadDocument(doc);
        // Re-fetch the list — restoring may itself produce a new entry
        // server-side (some backends snapshot before restoring).
        const next = await optsRef.current.onListVersions();
        if (!unmountedRef.current) setVersions(next);
      } catch (err) {
        optsRef.current.onError?.(err instanceof Error ? err : new Error(String(err)), 'restore');
      } finally {
        if (!unmountedRef.current) setLoading(false);
      }
    },
    [storeApi],
  );

  useEffect(() => {
    unmountedRef.current = false;
    if (!options.skipInitialFetch) void refresh();
    return () => {
      unmountedRef.current = true;
    };
    // refresh is stable; intentionally only re-run when the skip flag changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.skipInitialFetch]);

  return { versions, loading, refresh, createSnapshot, restore };
}
