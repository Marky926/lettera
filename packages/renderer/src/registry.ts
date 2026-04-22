/**
 * Block registry used by the renderer.
 *
 * Plugins register `BlockDefinition`s here; the renderer dispatches
 * `exportRender` by `node.type`. The same registry is reused by the editor
 * package (which additionally consumes `editorRender`).
 *
 * The registry is a simple class so multiple independent renderer instances
 * (e.g. one per editor surface) don't share global mutable state.
 */
import type { Block } from '@lettera/core';
import type { BlockDefinition } from '@lettera/sdk';

/**
 * Stored shape: a definition for some block in the union. Plugins may pass
 * narrowly-typed definitions for concrete subtypes (e.g. `BlockDefinition<Heading>`);
 * we widen on insertion via an `unknown` cast since `BlockDefinition` is
 * invariant in its block type parameter.
 */
type AnyBlockDef = BlockDefinition<Block>;

export class BlockRegistry {
  private readonly defs = new Map<string, AnyBlockDef>();

  register(def: BlockDefinition<any>): void {
    if (this.defs.has(def.type)) {
      // Last-wins, with a warning. Mirrors webpack/vite plugin conflict policy.
      // eslint-disable-next-line no-console
      console.warn(
        `[lettera] Block "${def.type}" was already registered; the new definition replaces it.`,
      );
    }
    this.defs.set(def.type, def as unknown as AnyBlockDef);
  }

  registerAll(defs: ReadonlyArray<BlockDefinition<any>>): void {
    for (const d of defs) this.register(d);
  }

  get(type: string): AnyBlockDef | undefined {
    return this.defs.get(type);
  }

  list(): AnyBlockDef[] {
    return [...this.defs.values()];
  }

  has(type: string): boolean {
    return this.defs.has(type);
  }
}
