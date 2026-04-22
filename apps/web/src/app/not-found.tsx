import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="lettera-shell">
      <h1>Not found</h1>
      <p className="muted">The page you were looking for doesn&apos;t exist.</p>
      <p>
        <Link href="/">← Back to home</Link>
      </p>
    </div>
  );
}
