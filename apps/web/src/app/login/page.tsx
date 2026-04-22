'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      router.push('/');
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? e.status === 401
            ? 'Invalid email or password.'
            : e.displayMessage
          : 'Login failed',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lettera-shell">
      <h1>Sign in</h1>
      <form onSubmit={submit}>
        <div className="row">
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
      </form>
      <p className="muted">
        No account? <Link href="/register">Create one</Link>
      </p>
    </div>
  );
}
