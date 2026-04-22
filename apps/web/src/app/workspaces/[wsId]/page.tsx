'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, type Project } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Workspace detail: list projects + create new ones.
 */
export default function WorkspacePage() {
  const { wsId } = useParams<{ wsId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');

  const projects = useQuery({
    queryKey: queryKeys.projects(wsId),
    queryFn: () => api<Project[]>(`/workspaces/${wsId}/projects`),
  });

  const create = useMutation({
    mutationFn: (n: string) =>
      api<Project>(`/workspaces/${wsId}/projects`, {
        method: 'POST',
        body: JSON.stringify({ name: n }),
      }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: queryKeys.projects(wsId) });
      router.push(`/projects/${p.id}`);
    },
  });

  return (
    <div className="lettera-shell">
      <p className="muted">
        <Link href="/">← Workspaces</Link>
      </p>
      <h1>Projects</h1>

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
            placeholder="New project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" disabled={create.isPending}>
            Create
          </button>
        </div>
      </form>

      <h2>All projects</h2>
      {projects.isLoading && <p>Loading…</p>}
      <ul>
        {projects.data?.map((p) => (
          <li key={p.id}>
            <Link href={`/projects/${p.id}`}>{p.name}</Link>
            <span className="muted">{p._count?.documents ?? 0} docs</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
