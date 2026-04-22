/**
 * Command palette (⌘K / Ctrl+K).
 *
 * Built on `cmdk`. Surfaces three command groups:
 *   - Insert: every block from the registry
 *   - Navigate: every section/row/column/block in the document
 *   - Actions: undo, redo, switch device
 *
 * Opens via the global keyboard shortcut and via TopBar button. Closes on
 * escape, blur, or after a command runs.
 */

import type { Block, Column, EmailDocument, Row, Section } from '@lettera/core';
import { Command } from 'cmdk';
import { useEffect, useMemo } from 'react';
import { getRegistry, makeBlockFromDef } from '../registry.js';
import { type Selection, useEditorStore } from '../store/editorStore.js';
import { pickInsertTarget } from '../util/path.js';

interface NavItem {
  id: string;
  label: string;
  type: Selection['type'];
}

function listNodes(doc: EmailDocument): NavItem[] {
  const out: NavItem[] = [];
  doc.root.forEach((s: Section, si) => {
    out.push({ id: s.id, label: s.name ?? `Section ${si + 1}`, type: 'section' });
    s.children.forEach((r: Row, ri) => {
      out.push({ id: r.id, label: `  Row ${ri + 1}`, type: 'row' });
      r.children.forEach((c: Column, ci) => {
        out.push({ id: c.id, label: `    Column ${ci + 1}`, type: 'column' });
        c.children.forEach((b: Block) => {
          out.push({
            id: b.id,
            label: `      ${b.name ?? b.type.replace('block.', '')}`,
            type: 'block',
          });
        });
      });
    });
  });
  return out;
}

export function CommandPalette() {
  const open = useEditorStore((s) => s.commandPaletteOpen);
  const setOpen = useEditorStore((s) => s.setCommandPaletteOpen);
  const dispatch = useEditorStore((s) => s.dispatch);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const setDevice = useEditorStore((s) => s.setDevice);
  const select = useEditorStore((s) => s.select);
  const doc = useEditorStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);

  const registry = getRegistry();
  const blocks = registry.list();
  const nodes = useMemo(() => listNodes(doc), [doc]);

  // Global shortcut.
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault();
        setOpen(!open);
      } else if (ev.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  function close() {
    setOpen(false);
  }

  function insertBlock(type: string) {
    const def = getRegistry().get(type);
    if (!def) return;
    const target = pickInsertTarget(doc, selection?.id ?? null);
    if (!target) return;
    const block = makeBlockFromDef(def);
    dispatch('doc/insertBlock', {
      parentId: target.columnId,
      index: target.index,
      block,
    });
    select({ id: block.id, type: 'block' });
    close();
  }

  return (
    <div
      className="lettera-cmdk-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <Command className="lettera-cmdk" label="Command palette">
        <Command.Input autoFocus placeholder="Type a command or search…" />
        <Command.List>
          <Command.Empty>No matching commands.</Command.Empty>

          <Command.Group heading="Insert block">
            {blocks.map((b) => (
              <Command.Item
                key={`insert-${b.type}`}
                value={`insert ${b.name} ${b.type}`}
                onSelect={() => insertBlock(b.type)}
              >
                + {b.name}
                <span className="lettera-cmdk-hint">{b.type}</span>
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="Navigate">
            {nodes.map((n) => (
              <Command.Item
                key={`nav-${n.id}`}
                value={`go ${n.label} ${n.type}`}
                onSelect={() => {
                  select({ id: n.id, type: n.type });
                  close();
                }}
              >
                {n.label}
                <span className="lettera-cmdk-hint">{n.type}</span>
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="Actions">
            <Command.Item
              value="undo"
              onSelect={() => {
                undo();
                close();
              }}
            >
              Undo
              <span className="lettera-cmdk-hint">⌘Z</span>
            </Command.Item>
            <Command.Item
              value="redo"
              onSelect={() => {
                redo();
                close();
              }}
            >
              Redo
              <span className="lettera-cmdk-hint">⌘⇧Z</span>
            </Command.Item>
            <Command.Item
              value="switch desktop preview"
              onSelect={() => {
                setDevice('desktop');
                close();
              }}
            >
              Preview: Desktop
            </Command.Item>
            <Command.Item
              value="switch mobile preview"
              onSelect={() => {
                setDevice('mobile');
                close();
              }}
            >
              Preview: Mobile
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
