/**
 * Reusable rich-text editor for Heading/Text block bodies.
 *
 * Wraps Tiptap with:
 *   - StarterKit (paragraph, bold, italic, etc.)
 *   - Link
 *   - VariableNode (host system merge tags rendered as chips)
 *
 * Emits raw HTML on every change. Coalescing in the command bus collapses
 * fast typing into a single history entry per node.
 */

import type { VariableDefinition } from '@lettera/core';
import Link from '@tiptap/extension-link';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useMemo, useRef } from 'react';
import { VariableNode } from '../tiptap/VariableNode.js';
import { INSERT_VARIABLE_EVENT } from './VariablesPanel.js';

export interface RichTextEditorProps {
  value: string;
  onChange(html: string): void;
  variables: readonly VariableDefinition[];
  /** Disable block-level nodes for headings (single line, no paragraphs/lists). */
  singleLine?: boolean;
  ariaLabel?: string;
}

export function RichTextEditor({
  value,
  onChange,
  variables,
  singleLine,
  ariaLabel,
}: RichTextEditorProps) {
  // Tiptap reads options once on init; we want VariableNode to always see the
  // *current* variables list, so wrap it in a ref-based getter.
  const varsRef = useRef(variables);
  varsRef.current = variables;

  const extensions = useMemo(
    () => [
      StarterKit.configure(
        singleLine
          ? {
              heading: false,
              bulletList: false,
              orderedList: false,
              blockquote: false,
              codeBlock: false,
              horizontalRule: false,
            }
          : {},
      ),
      Link.configure({ openOnClick: false, autolink: true }),
      VariableNode.configure({ getVariables: () => varsRef.current }),
    ],
    [singleLine],
  );

  const editor = useEditor({
    extensions,
    content: value,
    editorProps: {
      attributes: {
        class: 'lettera-rte',
        ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
      },
    },
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  // Keep the editor in sync if the underlying value changes (undo, doc swap).
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value, false);
    }
  }, [value, editor]);

  // Listen for variable-insert events from the side panel; only insert if this
  // editor instance is the focused one.
  useEffect(() => {
    if (!editor) return;
    const handler = (ev: Event) => {
      if (!editor.isFocused) return;
      const path = (ev as CustomEvent<{ path: string }>).detail?.path;
      if (path) editor.chain().focus().insertVariable(path).run();
    };
    window.addEventListener(INSERT_VARIABLE_EVENT, handler);
    return () => window.removeEventListener(INSERT_VARIABLE_EVENT, handler);
  }, [editor]);

  // Group variables for the dropdown.
  const grouped = useMemo(() => {
    const m = new Map<string, VariableDefinition[]>();
    for (const v of variables) {
      const g = v.group ?? 'Variables';
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(v);
    }
    return [...m.entries()];
  }, [variables]);

  return (
    <div className="lettera-rte-wrap">
      <div className="lettera-rte-toolbar" role="toolbar" aria-label="Formatting">
        <button
          type="button"
          aria-label="Bold"
          aria-pressed={editor?.isActive('bold') ?? false}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          B
        </button>
        <button
          type="button"
          aria-label="Italic"
          aria-pressed={editor?.isActive('italic') ?? false}
          style={{ fontStyle: 'italic' }}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          I
        </button>
        <button
          type="button"
          aria-label="Link"
          onClick={() => {
            const url = window.prompt('Link URL', 'https://');
            if (!url) return;
            editor?.chain().focus().setLink({ href: url }).run();
          }}
        >
          🔗
        </button>
        {variables.length > 0 && (
          <select
            aria-label="Insert variable"
            defaultValue=""
            onChange={(e) => {
              const path = e.target.value;
              if (!path) return;
              editor?.chain().focus().insertVariable(path).run();
              e.target.value = '';
            }}
          >
            <option value="">+ Variable…</option>
            {grouped.map(([group, items]) => (
              <optgroup key={group} label={group}>
                {items.map((v) => (
                  <option key={v.path} value={v.path}>
                    {v.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
