/**
 * `@lettera/email-builder` — single-entrypoint meta-package.
 *
 * Re-exports the entire Lettera stack (core document model, renderer,
 * SDK, standard block library, and the React editor) behind one install.
 * For most integrators this is the only dependency they need.
 *
 * For bundler-size reasons the package also ships split entrypoints:
 *
 *   - `@lettera/email-builder/server` — pure render + lint (no React)
 *   - `@lettera/email-builder/editor` — React editor component + store
 *   - `@lettera/email-builder/hooks`  — just the persistence/preview hooks
 *
 * @example
 * ```ts
 * // CRM dashboard, everything in one file:
 * import {
 *   LetteraEditor,
 *   usePersistence,
 *   render,
 *   standardBlocks,
 *   type EmailDocument,
 * } from '@lettera/email-builder';
 * import '@lettera/editor/styles.css';
 * ```
 */

export * from './server.js';
export * from './editor.js';
