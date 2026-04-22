'use client';

/**
 * Next.js App Router error boundary. Rendered by Next when any client
 * component below throws. Keep it intentionally small — the goal is a
 * non-scary escape hatch with a retry, not a pretty product screen.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="lettera-shell" role="alert" aria-live="assertive">
      <h1>Something went wrong</h1>
      <p className="muted">
        {error.message || 'An unexpected error occurred.'}
        {error.digest ? ` (ref: ${error.digest})` : null}
      </p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
