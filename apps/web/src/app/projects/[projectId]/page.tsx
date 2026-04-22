'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, type DocumentSummary } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Project detail: list documents + create new blank documents.
 */
export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');

  const docs = useQuery({
    queryKey: queryKeys.documents(projectId),
    queryFn: () => api<DocumentSummary[]>(`/projects/${projectId}/documents`),
  });

  const create = useMutation({
    mutationFn: (n: string) =>
      api<DocumentSummary>(`/projects/${projectId}/documents`, {
        method: 'POST',
        body: JSON.stringify({ name: n }),
      }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: queryKeys.documents(projectId) });
      router.push(`/documents/${d.id}`);
    },
  });

  return (
    <div className="lettera-shell">
      <p className="muted">
        <Link href="/">← Workspaces</Link>
      </p>
      <h1>Documents</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          create.mutate(name.trim());
          setName('');
        }}
      >
        <div className="row">
          <input
            placeholder="New document name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" disabled={create.isPending}>
            Create blank
          </button>
        </div>
      </form>

      <h2>All documents</h2>
      {docs.isLoading && <p>Loading…</p>}
      <ul>
        {docs.data?.map((d) => (
          <li key={d.id}>
            <Link href={`/documents/${d.id}`}>{d.name}</Link>
            <span className="muted">edited {new Date(d.updatedAt).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
