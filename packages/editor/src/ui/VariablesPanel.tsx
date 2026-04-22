/**
 * Variables panel.
 *
 * Two display modes, picked at render time based on what the host supplies:
 *
 *   - **Tree** (when a `VariableSchema` is present on the store): shows a
 *     collapsible tree rooted at each top-level field. Objects expand to
 *     their children; lists show their item shape under a "list" header plus
 *     a dedicated insert-as-repeater action. Leaves display their type as a
 *     tiny badge (S / # / $ / 🕒 / ☑).
 *   - **Flat list** (legacy): groups the old `VariableDefinition[]` by
 *     their `group` field — identical UX to the original panel.
 *
 * Clicking a leaf inserts `{{path}}` into the focused Tiptap editor via the
 * `lettera:insert-variable` event bus (unchanged). Clicking a list emits a
 * different event consumed by the canvas/command bus to wrap selection in a
 * new repeater.
 */
import type { VariableSchema, VariableSchemaNode } from '@lettera/core';
import { useMemo, useState } from 'react';
import { useEditorStore } from '../store/editorStore.js';

export const INSERT_VARIABLE_EVENT = 'lettera:insert-variable';
export const INSERT_REPEATER_EVENT = 'lettera:insert-repeater';

export interface InsertVariableEvent extends CustomEvent<{ path: string }> {}
export interface InsertRepeaterEvent extends CustomEvent<{ source: string; alias: string }> {}

export function emitInsertVariable(path: string): void {
  window.dispatchEvent(new CustomEvent(INSERT_VARIABLE_EVENT, { detail: { path } }));
}

export function emitInsertRepeater(source: string, alias: string): void {
  window.dispatchEvent(new CustomEvent(INSERT_REPEATER_EVENT, { detail: { source, alias } }));
}

export function VariablesPanel() {
  const schema = useEditorStore((s) => s.schema);

  if (schema && Object.keys(schema.fields).length > 0) {
    return <SchemaTreePanel schema={schema} />;
  }
  return <FlatVariablesPanel />;
}

// ---------------------------------------------------------------------------
// Tree view
// ---------------------------------------------------------------------------

function SchemaTreePanel({ schema }: { schema: VariableSchema }) {
  return (
    <div className="lettera-editor__panel">
      <h2>Variables</h2>
      <ul className="lettera-var-tree" role="tree">
        {Object.entries(schema.fields).map(([name, node]) => (
          <TreeNode key={name} name={name} path={name} node={node} depth={0} />
        ))}
      </ul>
    </div>
  );
}

interface TreeNodeProps {
  name: string;
  path: string;
  node: VariableSchemaNode;
  depth: number;
}

function TreeNode({ name, path, node, depth }: TreeNodeProps) {
  const [open, setOpen] = useState(depth === 0);
  const indent = { paddingLeft: `${depth * 10}px` } as const;

  if (node.kind === 'object') {
    return (
      <li role="treeitem" aria-expanded={open}>
        <button
          type="button"
          className="lettera-var-tree__row lettera-var-tree__row--branch"
          style={indent}
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden>{open ? '▾' : '▸'}</span>
          <span className="lettera-var-tree__label">{node.label ?? name}</span>
          <Badge kind="object" />
        </button>
        {open && (
          <ul role="group">
            {Object.entries(node.fields).map(([childName, child]) => (
              <TreeNode
                key={childName}
                name={childName}
                path={`${path}.${childName}`}
                node={child}
                depth={depth + 1}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  if (node.kind === 'list') {
    return (
      <li role="treeitem" aria-expanded={open}>
        <div className="lettera-var-tree__row lettera-var-tree__row--branch" style={indent}>
          <button
            type="button"
            className="lettera-var-tree__toggle"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            <span aria-hidden>{open ? '▾' : '▸'}</span>
          </button>
          <span className="lettera-var-tree__label">{node.label ?? name}</span>
          <Badge kind="list" />
          <button
            type="button"
            className="lettera-var-tree__action"
            title={`Insert repeater over ${path}`}
            onClick={() => emitInsertRepeater(path, defaultAlias(name))}
          >
            + Repeater
          </button>
        </div>
        {open && node.item.kind === 'object' && (
          <ul role="group">
            {Object.entries(node.item.fields).map(([childName, child]) => (
              <TreeNode
                key={childName}
                name={childName}
                path={`${path}[].${childName}`}
                node={child}
                depth={depth + 1}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  // Scalar leaf.
  return (
    <li role="treeitem">
      <button
        type="button"
        className="lettera-var-tree__row"
        style={indent}
        title={node.description ?? path}
        onClick={() => emitInsertVariable(path)}
      >
        <span className="lettera-var-tree__label">{node.label ?? name}</span>
        <Badge kind={node.kind} />
      </button>
    </li>
  );
}

/**
 * Suggest a singular alias for a list field — strips a trailing `s` when
 * present so `services` becomes `service`. Authors can change it in the
 * inspector afterwards.
 */
function defaultAlias(name: string): string {
  if (name.length > 3 && name.endsWith('s')) return name.slice(0, -1);
  return 'item';
}

function Badge({ kind }: { kind: VariableSchemaNode['kind'] }) {
  const label =
    kind === 'currency'
      ? '$'
      : kind === 'number'
        ? '#'
        : kind === 'date' || kind === 'datetime'
          ? '🕒'
          : kind === 'boolean'
            ? '☑'
            : kind === 'list'
              ? '☰'
              : kind === 'object'
                ? '{}'
                : kind === 'email'
                  ? '@'
                  : kind === 'url'
                    ? '↗'
                    : 'S';
  return (
    <span className="lettera-var-tree__badge" data-kind={kind} aria-label={`type: ${kind}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Flat list (legacy)
// ---------------------------------------------------------------------------

function FlatVariablesPanel() {
  const variables = useEditorStore((s) => s.variables);

  const grouped = useMemo(() => {
    const m = new Map<string, typeof variables>();
    for (const v of variables) {
      const g = v.group ?? 'Variables';
      if (!m.has(g)) m.set(g, []);
      (m.get(g) as (typeof variables)[number][]).push(v);
    }
    return [...m.entries()];
  }, [variables]);

  if (variables.length === 0) return null;

  return (
    <div className="lettera-editor__panel">
      <h2>Variables</h2>
      {grouped.map(([group, items]) => (
        <div key={group} style={{ marginBottom: 8 }}>
          <div
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#9ca3af',
              marginBottom: 4,
            }}
          >
            {group}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {items.map((v) => (
              <button
                key={v.path}
                type="button"
                className="lettera-var-pill"
                title={v.description ?? v.path}
                onClick={() => emitInsertVariable(v.path)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
