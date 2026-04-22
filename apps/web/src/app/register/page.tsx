'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name: name || undefined }),
      });
      router.push('/');
    } catch (e) {
      setErr(e instanceof ApiError ? e.displayMessage : 'Sign-up failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lettera-shell">
      <h1>Create your account</h1>
      <form onSubmit={submit}>
        <div className="row">
          <input
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
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
            placeholder="Password (10+ chars, letter + digit)"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </div>
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
      </form>
      <p className="muted">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </div>
  );
}
