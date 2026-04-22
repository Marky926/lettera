/**
 * Block registry shared between the editor preview iframe and any direct
 * exports the host app may want to perform (e.g. "Export HTML" button).
 *
 * The registry is mutable — apps can add custom blocks before mounting the
 * editor. We default to the standard library.
 */

import { standardBlocks } from '@lettera/blocks-standard';
import { type Block, makeBlock } from '@lettera/core';
import { BlockRegistry } from '@lettera/renderer';
import type { BlockDefinition } from '@lettera/sdk';

let shared: BlockRegistry | null = null;

export function getRegistry(): BlockRegistry {
  if (!shared) {
    shared = new BlockRegistry();
    shared.registerAll(standardBlocks);
  }
  return shared;
}

export function setRegistry(r: BlockRegistry): void {
  shared = r;
}

/**
 * Instantiate a new `Block` from a registered `BlockDefinition`. Centralising
 * this here keeps the `type`/`defaultProps` narrowing in one spot so the
 * insertion call sites (palette, DnD, command palette) don't need `as never`
 * or ad-hoc casts.
 */
export function makeBlockFromDef(def: BlockDefinition<Block>): Block {
  return makeBlock(def.type, def.defaultProps);
}
