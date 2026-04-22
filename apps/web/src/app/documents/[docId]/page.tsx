'use client';

import type { EmailDocument } from '@lettera/core';
import {
  type VersionEntry as HookVersionEntry,
  type SaveContext,
  usePersistence,
  useVersions,
} from '@lettera/editor';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api, type DocumentFull, type VersionEntry } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import '@lettera/editor/styles.css';

/**
 * The editor uses browser-only APIs (Tiptap, dnd-kit). Keep it out of the
 * Next SSR bundle so the page shell renders instantly and the editor JS
 * arrives lazily.
 */
const LetteraEditor = dynamic(() => import('@lettera/editor').then((m) => m.LetteraEditor), {
  ssr: false,
  loading: () => <div style={{ padding: 24 }}>Loading editor…</div>,
});

export default function DocumentPage() {
  const { docId } = useParams<{ docId: string }>();

  const docQuery = useQuery({
    queryKey: queryKeys.document(docId),
    queryFn: () => api<DocumentFull>(`/documents/${docId}`),
  });

  const initial = docQuery.data?.content as EmailDocument | undefined;

  if (docQuery.isLoading) return <div className="lettera-shell">Loading…</div>;
  if (!docQuery.data || !initial) return <div className="lettera-shell">Document not found.</div>;

  return (
    <div style={{ height: '100vh' }}>
      <LetteraEditor
        // Remount only when a different document is opened. Deliberately NOT
        // keyed on updatedAt — otherwise any background refetch of the doc
        // query would unmount the editor and wipe the user's undo history,
        // selection, and layout toggle. The editor reconciles content
        // updates internally via `loadDocument` when the `document` prop
        // reference changes.
        key={docId}
        document={initial}
        layout="compact"
        versionsPanel={
          <DocPanel
            docId={docId}
            projectId={docQuery.data.projectId}
            docName={docQuery.data.name}
            initialUpdatedAt={docQuery.data.updatedAt}
          />
        }
      />
    </div>
  );
}

/**
 * Side panel with autosave status, manual snapshot trigger, and version
 * history. Rendered inside the editor's store provider, so the persistence
 * hooks have access to the same store the canvas mutates.
 */
function DocPanel({
  docId,
  projectId,
  docName,
  initialUpdatedAt,
}: {
  docId: string;
  projectId: string;
  docName: string;
  initialUpdatedAt: string;
}) {
  const qc = useQueryClient();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [snapshotting, setSnapshotting] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const persistence = usePersistence({
    onSave: async (doc: EmailDocument, { signal }: SaveContext) => {
      const r = await api<{ id: string; updatedAt: string; snapshotted: boolean }>(
        `/documents/${docId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ content: doc }),
          signal,
        },
      );
      setSavedAt(r.updatedAt);
      if (r.snapshotted) qc.invalidateQueries({ queryKey: queryKeys.versions(docId) });
    },
    onSaveError: (err) => {
      if (err.name === 'AbortError') return;
      console.error('Autosave failed', err);
    },
  });

  const versions = useVersions({
    onListVersions: async () => {
      const list = await api<VersionEntry[]>(`/documents/${docId}/versions`);
      return list as unknown as HookVersionEntry[];
    },
    onSnapshot: async (doc, label) => {
      // Wait for any pending autosave so the snapshot reflects on-screen state.
      setSnapshotting(true);
      try {
        await persistence.flush();
        const v = await api<VersionEntry>(`/documents/${docId}/versions`, {
          method: 'POST',
          body: JSON.stringify({ label, content: doc }),
        });
        qc.invalidateQueries({ queryKey: queryKeys.versions(docId) });
        return v as unknown as HookVersionEntry;
      } finally {
        setSnapshotting(false);
      }
    },
    onRestore: async (vid) => {
      // Cancel pending autosave so it cannot overwrite the restored content.
      setRestoring(true);
      try {
        persistence.cancel();
        const restored = await api<DocumentFull>(`/documents/${docId}/versions/${vid}/restore`, {
          method: 'POST',
        });
        qc.setQueryData(queryKeys.document(docId), restored);
        setSavedAt(restored.updatedAt);
        return restored.content as EmailDocument;
      } finally {
        setRestoring(false);
      }
    },
    onError: (err, op) => {
      console.error(`Versions ${op} failed`, err);
    },
  });

  const status = restoring
    ? 'Restoring…'
    : snapshotting
      ? 'Saving snapshot…'
      : persistence.isSaving
        ? 'Saving…'
        : savedAt
          ? `Saved ${new Date(savedAt).toLocaleTimeString()}`
          : `Last saved ${new Date(initialUpdatedAt).toLocaleTimeString()}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
      <div>
        <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
          <Link href={`/projects/${projectId}`}>← Back to project</Link>
        </p>
        <h2 style={{ margin: '8px 0 2px', fontSize: 15 }}>{docName}</h2>
        <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>{status}</p>
      </div>

      <button
        type="button"
        style={{
          padding: '6px 10px',
          border: '1px solid #1f6feb',
          background: '#1f6feb',
          color: 'white',
          borderRadius: 6,
          cursor: snapshotting ? 'wait' : 'pointer',
          opacity: snapshotting ? 0.6 : 1,
          fontSize: 13,
        }}
        onClick={() => void versions.createSnapshot('manual')}
        disabled={snapshotting}
      >
        Save snapshot
      </button>

      <div>
        <h3 style={{ margin: '4px 0 6px', fontSize: 12, color: '#374151' }}>Version history</h3>
        {versions.loading && versions.versions.length === 0 && (
          <p style={{ margin: 0, fontSize: 12 }}>Loading…</p>
        )}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {versions.versions.map((v) => {
            const entry = v as unknown as VersionEntry;
            return (
              <li
                key={entry.id}
                style={{
                  padding: '8px 0',
                  borderBottom: '1px solid #eef0f4',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {entry.label ?? '—'}
                  </strong>
                  <button
                    type="button"
                    onClick={() => void versions.restore(entry.id)}
                    disabled={restoring}
                    style={{
                      border: '1px solid #d6dbe3',
                      background: '#fff',
                      borderRadius: 4,
                      padding: '2px 6px',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    Restore
                  </button>
                </div>
                <div style={{ color: '#6b7280' }}>
                  {new Date(entry.createdAt).toLocaleString()} · {entry.author?.email ?? 'system'}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
