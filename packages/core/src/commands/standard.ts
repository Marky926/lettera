/**
 * Standard commands operating on an `EmailDocument`.
 *
 * Editor consumers typically register all of these on a single `CommandBus<EmailDocument>`
 * via {@link registerStandardCommands}. They cover insertion, deletion, move,
 * style mutation, and prop edits — enough for the MVP editor.
 */

import { findNode, makeColumn, makeRow, makeSection, reIdSubtree } from '../document.js';
import type {
  Block,
  BodySettings,
  Column,
  ColumnWidth,
  EmailDocument,
  Row,
  Section,
  StyleDelta,
} from '../schema/index.js';
import { DEFAULT_CONTENT_WIDTH } from '../schema/index.js';
import type { CommandBus, CommandDefinition } from './bus.js';

type ParentLike = Section | Row | Column | Block;

/**
 * Returns the array that owns the given parent node's direct children. The
 * document is special-cased because its top-level array is `root`, not
 * `children`. Container blocks (repeater/conditional) and the conditional
 * node's `else` branch use `children`/`else` and are read by their owning
 * commands directly when needed.
 */
function getChildrenArray(
  parent: ParentLike | EmailDocument,
): Array<Section | Row | Column | Block> {
  if ((parent as EmailDocument).schemaVersion !== undefined) {
    return (parent as EmailDocument).root as unknown as Array<Section | Row | Column | Block>;
  }
  return (parent as { children?: unknown[] }).children as Array<Section | Row | Column | Block>;
}

/** A node is a container if it owns a `children` array we're allowed to splice into. */
function isContainerParent(node: { type?: string } | undefined): boolean {
  if (!node) return false;
  return (
    node.type === 'column' || node.type === 'block.repeater' || node.type === 'block.conditional'
  );
}

// ---------------------------------------------------------------------------
// Command payloads
// ---------------------------------------------------------------------------

export interface InsertBlockPayload {
  parentId: string; // must be a Column
  index?: number;
  block: Block;
}

export interface RemoveNodePayload {
  id: string;
}

export interface MoveNodePayload {
  id: string;
  newParentId: string;
  newIndex: number;
}

export interface DuplicateNodePayload {
  id: string;
}

export interface UpdatePropsPayload {
  id: string;
  /** Partial props; deep-merged at top level. */
  props: Record<string, unknown>;
}

export interface UpdateStylesPayload {
  id: string;
  styles: StyleDelta;
  /** When 'mobile', writes to `responsive.mobile.styles` instead. */
  scope?: 'base' | 'mobile';
}

export interface RenamePayload {
  id: string;
  name: string;
}

export interface ToggleLockPayload {
  id: string;
}

export interface ToggleHiddenPayload {
  id: string;
  device: 'desktop' | 'mobile';
}

export interface InsertRowPayload {
  /** Section to insert into. If omitted, inserts into the first section. */
  sectionId?: string;
  /** Position within the section (defaults to end). */
  index?: number;
  /** Column widths for the new row, e.g. ['1/2','1/2']. Defaults to ['1/1']. */
  columns?: ColumnWidth[];
}

export interface InsertColumnPayload {
  rowId: string;
  index?: number;
  width?: ColumnWidth;
}

export interface InsertSectionPayload {
  index?: number;
  contentWidth?: number;
}

export interface UpdateBodyPayload {
  body: Partial<BodySettings>;
}

// ---------------------------------------------------------------------------
// Command definitions
// ---------------------------------------------------------------------------

export const InsertBlockCommand: CommandDefinition<EmailDocument, InsertBlockPayload> = {
  type: 'doc/insertBlock',
  label: 'Insert block',
  apply(draft, { parentId, index, block }) {
    const found = findNode(draft, parentId);
    const node = found?.node as { type?: string; children?: Block[] } | undefined;
    if (!found || !isContainerParent(node)) {
      throw new Error(`Cannot insert block into non-container parent ${parentId}`);
    }
    const parent = found.node as unknown as { children: Block[] };
    if (!Array.isArray(parent.children)) parent.children = [];
    const at = index ?? parent.children.length;
    parent.children.splice(at, 0, block);
  },
};

export const RemoveNodeCommand: CommandDefinition<EmailDocument, RemoveNodePayload> = {
  type: 'doc/remove',
  label: 'Delete',
  apply(draft, { id }) {
    const found = findNode(draft, id);
    if (!found || !found.parent) return;
    const parent = found.parent as ParentLike | EmailDocument;
    const arr = getChildrenArray(parent);
    if (!Array.isArray(arr)) return;
    const idx = arr.findIndex((n) => (n as { id: string }).id === id);
    if (idx >= 0) arr.splice(idx, 1);
  },
};

export const DuplicateNodeCommand: CommandDefinition<EmailDocument, DuplicateNodePayload> = {
  type: 'doc/duplicate',
  label: 'Duplicate',
  apply(draft, { id }) {
    const found = findNode(draft, id);
    if (!found || !found.parent) return;
    const parent = found.parent as ParentLike | EmailDocument;
    const arr = getChildrenArray(parent);
    if (!Array.isArray(arr)) return;
    const idx = arr.findIndex((n) => (n as { id: string }).id === id);
    if (idx < 0) return;
    const original = arr[idx] as { id: string; children?: unknown[] };
    const clone = reIdSubtree(original);
    arr.splice(idx + 1, 0, clone as never);
  },
};

export const MoveNodeCommand: CommandDefinition<EmailDocument, MoveNodePayload> = {
  type: 'doc/move',
  label: 'Move',
  apply(draft, { id, newParentId, newIndex }) {
    const found = findNode(draft, id);
    if (!found || !found.parent) return;
    const oldParent = found.parent as ParentLike | EmailDocument;
    const oldArr = getChildrenArray(oldParent);
    if (!Array.isArray(oldArr)) return;
    const oldIdx = oldArr.findIndex((n) => (n as { id: string }).id === id);
    if (oldIdx < 0) return;

    const newParentFound = findNode(draft, newParentId);
    if (!newParentFound) return;
    const newParent = newParentFound.node as ParentLike | EmailDocument;
    const newArr = getChildrenArray(newParent);
    if (!Array.isArray(newArr)) return;

    const [moved] = oldArr.splice(oldIdx, 1);
    if (!moved) return;
    // Insert at newIndex, clamped.
    const at = Math.max(0, Math.min(newIndex, newArr.length));
    newArr.splice(at, 0, moved);
  },
};

export const UpdatePropsCommand: CommandDefinition<EmailDocument, UpdatePropsPayload> = {
  type: 'doc/updateProps',
  label: 'Edit properties',
  coalesceKey: ({ id }) => `updateProps:${id}`,
  apply(draft, { id, props }) {
    const found = findNode(draft, id);
    if (!found) return;
    const node = found.node as { props?: Record<string, unknown> };
    node.props = { ...(node.props ?? {}), ...props };
  },
};

export const UpdateStylesCommand: CommandDefinition<EmailDocument, UpdateStylesPayload> = {
  type: 'doc/updateStyles',
  label: 'Edit styles',
  coalesceKey: ({ id, scope }) => `updateStyles:${id}:${scope ?? 'base'}`,
  apply(draft, { id, styles, scope = 'base' }) {
    const found = findNode(draft, id);
    if (!found) return;
    const node = found.node as {
      styles?: StyleDelta;
      responsive?: { mobile?: { styles?: StyleDelta } };
    };
    if (scope === 'base') {
      node.styles = { ...(node.styles ?? {}), ...styles };
    } else {
      node.responsive ??= {};
      node.responsive.mobile ??= {};
      node.responsive.mobile.styles = { ...(node.responsive.mobile.styles ?? {}), ...styles };
    }
  },
};

export const RenameCommand: CommandDefinition<EmailDocument, RenamePayload> = {
  type: 'doc/rename',
  label: 'Rename',
  coalesceKey: ({ id }) => `rename:${id}`,
  apply(draft, { id, name }) {
    const found = findNode(draft, id);
    if (!found) return;
    (found.node as { name?: string }).name = name;
  },
};

export const ToggleLockCommand: CommandDefinition<EmailDocument, ToggleLockPayload> = {
  type: 'doc/toggleLock',
  label: 'Toggle lock',
  apply(draft, { id }) {
    const found = findNode(draft, id);
    if (!found) return;
    const n = found.node as { locked?: boolean };
    n.locked = !n.locked;
  },
};

export const ToggleHiddenCommand: CommandDefinition<EmailDocument, ToggleHiddenPayload> = {
  type: 'doc/toggleHidden',
  label: 'Toggle visibility',
  apply(draft, { id, device }) {
    const found = findNode(draft, id);
    if (!found) return;
    const n = found.node as { hidden?: { desktop?: boolean; mobile?: boolean } };
    n.hidden ??= {};
    n.hidden[device] = !n.hidden[device];
  },
};

export const InsertRowCommand: CommandDefinition<EmailDocument, InsertRowPayload> = {
  type: 'doc/insertRow',
  label: 'Insert row',
  apply(draft, { sectionId, index, columns }) {
    const sections = draft.root;
    let target: Section | undefined;
    if (sectionId) {
      const found = findNode(draft, sectionId);
      if (found && (found.node as { type?: string }).type === 'section') {
        target = found.node as Section;
      }
    }
    target ??= sections[0];
    if (!target) return;
    const row = makeRow(columns && columns.length > 0 ? columns : ['1/1']);
    const at = index ?? target.children.length;
    target.children.splice(at, 0, row);
  },
};

export const InsertColumnCommand: CommandDefinition<EmailDocument, InsertColumnPayload> = {
  type: 'doc/insertColumn',
  label: 'Insert column',
  apply(draft, { rowId, index, width }) {
    const found = findNode(draft, rowId);
    if (!found || (found.node as { type?: string }).type !== 'row') return;
    const row = found.node as Row;
    const col = makeColumn(width ?? '1/1');
    const at = index ?? row.children.length;
    row.children.splice(at, 0, col);
  },
};

export const InsertSectionCommand: CommandDefinition<EmailDocument, InsertSectionPayload> = {
  type: 'doc/insertSection',
  label: 'Insert section',
  apply(draft, { index, contentWidth }) {
    // Sections start empty so the user can pick a row layout from the
    // palette/RightPanel — the previous auto-row meant clicking "+ Section"
    // immediately produced a section + row + 1/1 column, which surprised
    // users who wanted to lay out columns themselves.
    const sec = makeSection({
      contentWidth: contentWidth ?? draft.body?.contentWidth ?? DEFAULT_CONTENT_WIDTH,
      withRow: false,
    });
    const at = index ?? draft.root.length;
    draft.root.splice(at, 0, sec);
  },
};

export const UpdateBodyCommand: CommandDefinition<EmailDocument, UpdateBodyPayload> = {
  type: 'doc/updateBody',
  label: 'Edit body settings',
  coalesceKey: () => 'updateBody',
  apply(draft, { body }) {
    draft.body = {
      ...(draft.body ?? { contentWidth: DEFAULT_CONTENT_WIDTH }),
      ...body,
    } as BodySettings;
  },
};

export const STANDARD_COMMANDS = [
  InsertBlockCommand,
  RemoveNodeCommand,
  DuplicateNodeCommand,
  MoveNodeCommand,
  UpdatePropsCommand,
  UpdateStylesCommand,
  RenameCommand,
  ToggleLockCommand,
  ToggleHiddenCommand,
  InsertRowCommand,
  InsertColumnCommand,
  InsertSectionCommand,
  UpdateBodyCommand,
] as const;

export function registerStandardCommands(bus: CommandBus<EmailDocument>): void {
  for (const cmd of STANDARD_COMMANDS) {
    // Casting because the union loses payload specificity.
    bus.register(cmd as unknown as CommandDefinition<EmailDocument, unknown>);
  }
}
