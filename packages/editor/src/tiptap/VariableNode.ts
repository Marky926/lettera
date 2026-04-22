/**
 * Tiptap inline node representing a host-system variable (a.k.a. merge tag).
 *
 * Renders in the editor as a styled chip showing the variable's friendly
 * label, but serializes to / parses from the canonical wire format
 * `<span data-lettera-var="path"></span>` so it round-trips cleanly through
 * the document and is picked up by the renderer's substitution pass.
 */

import type { VariableDefinition } from '@lettera/core';
import { mergeAttributes, Node } from '@tiptap/core';

export interface VariableNodeOptions {
  /** Editor passes the live variables list so the chip can show the current label. */
  getVariables: () => readonly VariableDefinition[];
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    letteraVariable: {
      insertVariable: (path: string) => ReturnType;
    };
  }
}

export const VariableNode = Node.create<VariableNodeOptions>({
  name: 'letteraVariable',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { getVariables: () => [] };
  },

  addAttributes() {
    return {
      path: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-lettera-var') ?? '',
        renderHTML: (attrs) => ({ 'data-lettera-var': attrs.path as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-lettera-var]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // Wire format on save. The renderer substitutes this on export/preview.
    return ['span', mergeAttributes(HTMLAttributes), ''];
  },

  addNodeView() {
    // Custom rendering inside the editor — readable chip with the friendly label.
    return ({ node, HTMLAttributes }) => {
      const path = (node.attrs.path as string) ?? '';
      const vars = this.options.getVariables();
      const def = vars.find((v) => v.path === path);
      const dom = document.createElement('span');
      dom.setAttribute('data-lettera-var', path);
      Object.entries(HTMLAttributes).forEach(([k, v]) => {
        if (k !== 'data-lettera-var' && typeof v === 'string') dom.setAttribute(k, v);
      });
      dom.className = 'lettera-var-chip';
      dom.contentEditable = 'false';
      dom.textContent = def ? def.label : path;
      dom.title = def?.description ?? path;
      return { dom };
    };
  },

  addCommands() {
    return {
      insertVariable:
        (path: string) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { path } }),
    };
  },
});
