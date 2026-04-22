/**
 * usePersistence — debounced autosave for the editor document.
 *
 * Replaces the ~100 LOC of boilerplate that integrating apps would
 * otherwise duplicate (debounce timer, last-sent ref, in-flight ref,
 * `beforeunload` flush, race-safety against snapshot/restore).
 *
 * The hook subscribes to the editor store, debounces document mutations,
 * and calls the host-supplied `onSave` callback. It guarantees:
 *
 *   - Only one in-flight save at a time. Subsequent changes coalesce into
 *     a single follow-up save once the in-flight one resolves.
 *   - The same document is never sent twice in a row (cheap reference
 *     equality — works because the command bus produces new immer drafts).
 *   - `flush()` and `cancel()` are stable (suitable as dependency-free
 *     refs in effects).
 *   - On `beforeunload` we synchronously trigger a final flush. Browsers
 *     no longer support blocking the unload, but the request is queued
 *     via `navigator.sendBeacon` if the integrator opts in via
 *     `beaconUrl` (see `useBeaconFlush`).
 *
 * Typical usage:
 *
 * ```tsx
 * const { isSaving, flush } = usePersistence({
 *   autosaveDelay: 1500,
 *   onSave: async (doc, { signal }) => {
 *     await fetch(`/api/templates/${id}`, {
 *       method: 'PATCH',
 *       body: JSON.stringify({ content: doc }),
 *       signal,
 *     });
 *   },
 *   onSaveError: (err) => toast.error(err.message),
 * });
 * ```
 */

import type { EmailDocument } from '@lettera/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStoreApi } from '../store/editorStore.js';

/**
 * Context handed to the host's `onSave`. The `signal` aborts when the
 * component using the hook unmounts or a newer save supersedes this one,
 * so HTTP clients can cancel the request and avoid late `setState`.
 */
export interface SaveContext {
  signal: AbortSignal;
}

export interface UsePersistenceOptions {
  /**
   * Called after `autosaveDelay` ms of no further document changes. Receives
   * the current document and a `SaveContext` whose `signal` aborts when a
   * newer save begins or the host unmounts. Should return a promise that
   * resolves when the persistence layer has accepted the document.
   */
  onSave(doc: EmailDocument, context: SaveContext): Promise<void> | void;

  /**
   * Debounce delay in milliseconds. Defaults to 1500. Set to 0 to save on
   * every change (rarely desirable).
   */
  autosaveDelay?: number;

  /**
   * Called when `onSave` rejects. The hook swallows the rejection so the
   * autosave loop continues; surface the error here (toast, Sentry, …).
   */
  onSaveError?(error: Error): void;

  /**
   * Optional: called immediately *before* a save begins, with the document
   * about to be sent. Useful for optimistic UI ("Saving…" badge).
   */
  onSaveStart?(doc: EmailDocument): void;

  /**
   * Optional: called after a save resolves. The argument is the document
   * that was actually persisted (may differ from the live store doc if
   * the user kept editing during the save).
   */
  onSaveSuccess?(doc: EmailDocument): void;

  /**
   * If true, attempt a synchronous flush in `beforeunload`. Defaults to
   * `true`. Disable if your `onSave` cannot run during page unload (e.g.
   * it relies on async-only APIs and you have a separate beacon path).
   *
   * **Reliability caveat.** Modern browsers do not block navigation on
   * the promise returned from `onSave`, so the request is started but
   * not guaranteed to reach the server. For critical writes layer your
   * own `navigator.sendBeacon` call or a server-side draft channel on
   * top of this hook.
   */
  flushOnUnload?: boolean;
}

export interface UsePersistenceResult {
  /**
   * Force-save the latest document immediately, bypassing the debounce.
   * Returns once the save has either completed or been superseded.
   */
  flush(): Promise<void>;

  /**
   * Discard any pending debounce without saving. The next document change
   * will re-arm the debounce as usual.
   */
  cancel(): void;

  /** True between the moment `onSave` is invoked and its promise settles. */
  isSaving: boolean;
}

const DEFAULT_DELAY_MS = 1500;

export function usePersistence(options: UsePersistenceOptions): UsePersistenceResult {
  const storeApi = useEditorStoreApi();
  const [isSaving, setIsSaving] = useState(false);

  // Stash callbacks in a ref so the persistence loop never resubscribes
  // when the host re-renders with new closures. The loop reads from the
  // ref at call time so it always sees the latest handlers.
  const optsRef = useRef(options);
  optsRef.current = options;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<EmailDocument | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const inflightAbortRef = useRef<AbortController | null>(null);
  const unmountedRef = useRef(false);

  const cancel = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  const performSave = useCallback(
    async (doc: EmailDocument): Promise<void> => {
      // Abort any in-flight save before starting a new one. This means
      // the host's `signal` will fire on the previous SaveContext, letting
      // its fetch() bail out and avoiding wasted network round-trips.
      inflightAbortRef.current?.abort();
      const controller = new AbortController();
      inflightAbortRef.current = controller;

      lastSentRef.current = doc;
      if (!unmountedRef.current) setIsSaving(true);
      optsRef.current.onSaveStart?.(doc);

      const promise = Promise.resolve(
        optsRef.current.onSave(doc, { signal: controller.signal }),
      ) as Promise<void>;
      inflightRef.current = promise;

      try {
        await promise;
        if (!controller.signal.aborted) {
          optsRef.current.onSaveSuccess?.(doc);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          optsRef.current.onSaveError?.(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (inflightRef.current === promise) {
          inflightRef.current = null;
          inflightAbortRef.current = null;
        }
        if (!unmountedRef.current) setIsSaving(false);
      }
    },
    [],
  );

  const flush = useCallback(async (): Promise<void> => {
    cancel();
    if (inflightRef.current) {
      try {
        await inflightRef.current;
      } catch {
        /* swallow — handler already saw it via onSaveError */
      }
    }
    const current = storeApi.getState().doc;
    if (lastSentRef.current === current) return;
    await performSave(current);
  }, [cancel, performSave, storeApi]);

  // Subscribe to doc changes; arm debounce on every mutation.
  useEffect(() => {
    // Seed lastSent so the very first mount doesn't re-PATCH the just-loaded doc.
    lastSentRef.current = storeApi.getState().doc;
    const unsub = storeApi.subscribe((state, prev) => {
      if (state.doc === prev.doc) return;
      cancel();
      const delay = optsRef.current.autosaveDelay ?? DEFAULT_DELAY_MS;
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        const current = storeApi.getState().doc;
        if (lastSentRef.current === current) return;
        // If a save is already running, queue the next one to start when
        // it settles (this swallows intermediate edits into one trailing
        // request — exactly what an autosave loop should do).
        if (inflightRef.current) {
          void inflightRef.current.then(() => {
            // Re-check that no later debounce has been scheduled in the
            // meantime; if it has, let that path handle it.
            if (
              !debounceRef.current &&
              !inflightRef.current &&
              storeApi.getState().doc !== lastSentRef.current
            ) {
              void performSave(storeApi.getState().doc);
            }
          });
          return;
        }
        void performSave(current);
      }, delay);
    });
    return () => {
      unsub();
      cancel();
    };
  }, [storeApi, cancel, performSave]);

  // Best-effort flush on tab close. Browsers no longer block on the
  // promise but they do start the request, which is enough for most
  // auto-saves to land before the page is gone.
  useEffect(() => {
    if (options.flushOnUnload === false) return;
    const onBeforeUnload = () => {
      if (!debounceRef.current && !inflightRef.current) return;
      void flush();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [flush, options.flushOnUnload]);

  // Mark unmounted so async callbacks don't setState into a dead component.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      inflightAbortRef.current?.abort();
    };
  }, []);

  return { flush, cancel, isSaving };
}
