/**
 * Global loading UI for route transitions. Kept skeletal so it flashes only
 * briefly on slow navigations.
 */
export default function Loading() {
  return (
    <div className="lettera-shell" role="status" aria-live="polite">
      Loading…
    </div>
  );
}
