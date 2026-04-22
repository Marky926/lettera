/**
 * React editor entrypoint for `@lettera/email-builder`.
 *
 * Re-exports the full `@lettera/editor` surface (component, store, hooks,
 * registry). This entrypoint pulls React and Tiptap into the bundle —
 * only import from here in browser-facing code.
 *
 * Remember to also import the stylesheet:
 *
 * ```ts
 * import '@lettera/editor/styles.css';
 * ```
 */

export * from '@lettera/editor';
