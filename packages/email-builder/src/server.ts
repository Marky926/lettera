/**
 * Server-safe entrypoint for `@lettera/email-builder`.
 *
 * Contains everything needed to render and lint email documents on the
 * server (Node, edge workers, queue workers) with zero React dependency.
 * Use this in your API, background jobs, or server-side render pipeline.
 *
 * For the React editor, import from `@lettera/email-builder/editor` (or
 * from the root entrypoint which re-exports both).
 *
 * ## Block definitions vs schema types
 *
 * The names `RepeaterBlock` / `ConditionalBlock` mean two different
 * things in the stack: schema *types* (from `@lettera/core`) and block
 * *definitions* (from `@lettera/blocks-standard`). To avoid the
 * ambiguity this meta-package re-exports the block definitions under
 * the `standardBlocks` array and a namespace:
 *
 * ```ts
 * import { standardBlocks, StandardBlocks } from '@lettera/email-builder';
 * registry.registerAll(standardBlocks);           // array of defs
 * const heading = StandardBlocks.HeadingBlock;     // individual def
 * ```
 */

export * as StandardBlocks from '@lettera/blocks-standard';
export { standardBlocks } from '@lettera/blocks-standard';
export * from '@lettera/core';
export * from '@lettera/renderer';
export * from '@lettera/sdk';
