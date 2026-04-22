'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ApiError, api, type SessionUser, type Workspace } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Landing page: redirects to /login if no session, otherwise lists the
 * user's workspaces.
 */
export default function HomePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => api<{ user: SessionUser | null }>('/auth/me').catch(() => ({ user: null })),
  });

  useEffect(() => {
    if (me.isFetched && !me.data?.user) router.replace('/login');
  }, [me.isFetched, me.data, router]);

  const workspaces = useQuery({
    queryKey: queryKeys.workspaces(),
    queryFn: () => api<Workspace[]>('/workspaces'),
    enabled: !!me.data?.user,
  });

  const logout = useMutation({
    mutationFn: () =>
      api<{ ok: true }>('/auth/logout', { method: 'POST' }).catch(() => ({ ok: true as const })),
    onSuccess: () => {
      qc.clear();
      router.replace('/login');
    },
    onError: (e) => {
      // Logout should never block the UI; if the server call fails we still
      // clear the local cache and send the user back to login.
      if (!(e instanceof ApiError)) return;
      qc.clear();
      router.replace('/login');
    },
  });

  if (!me.data?.user)
    return (
      <div className="lettera-shell" role="status" aria-live="polite">
        Loading…
      </div>
    );

  return (
    <div className="lettera-shell">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Workspaces</h1>
        <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
          {logout.isPending ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
      <p className="muted">Signed in as {me.data.user.email}</p>
      {workspaces.isLoading && (
        <p role="status" aria-live="polite">
          Loading…
        </p>
      )}
      <ul>
        {workspaces.data?.map((w) => (
          <li key={w.id}>
            <Link href={`/workspaces/${w.id}`}>{w.name}</Link>
            <span className="muted">{w.role.toLowerCase()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
