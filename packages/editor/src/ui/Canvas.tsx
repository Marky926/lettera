/**
 * Iframe-isolated email preview with two integration points beyond rendering:
 *
 * 1. **Selection bridge** — a bootstrap script in the iframe captures clicks
 *    on `[data-lettera-id]` elements and posts the id back to the parent.
 *
 * 2. **Drop overlay** — the same bootstrap script measures every column +
 *    block and posts a layout snapshot. The parent renders a transparent
 *    overlay div above the iframe with `useDroppable` "gap" zones aligned
 *    to those rects, so users can drop palette items / blocks anywhere
 *    inside the canvas. The overlay only intercepts pointer events while
 *    a drag is in progress (`pointer-events: none` otherwise) so normal
 *    clicks reach the iframe.
 *
 * The iframe is loaded once with a stable skeleton (bootstrap + empty root
 * container). Subsequent renders patch the iframe's DOM in place — head
 * styles via a dedicated `<style data-lettera-styles>` element, body content
 * via `#lettera-root.innerHTML`, selection outline via `postMessage`. This
 * avoids the visible flicker that would happen if we swapped `srcDoc` on
 * every doc change (every keystroke in the inspector regenerates the HTML).
 *
 * Linter warnings produced by `render()` are pushed into the editor store
 * so the bottom Linter panel can subscribe to them.
 */

import { useDndContext, useDroppable } from '@dnd-kit/core';
import { render } from '@lettera/renderer';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getRegistry } from '../registry.js';
import { useEditorStore } from '../store/editorStore.js';
import { GAP_PREFIX } from './DndProvider.js';

interface BlockRect {
  id: string;
  columnId: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ColumnRect {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Layout {
  height: number;
  blocks: BlockRect[];
  columns: ColumnRect[];
}

function sameLayout(a: Layout | null, b: Layout): boolean {
  if (!a) return false;
  if (a.height !== b.height) return false;
  if (a.blocks.length !== b.blocks.length || a.columns.length !== b.columns.length) return false;
  for (let i = 0; i < a.blocks.length; i++) {
    const x = a.blocks[i]!;
    const y = b.blocks[i]!;
    if (
      x.id !== y.id ||
      x.columnId !== y.columnId ||
      x.top !== y.top ||
      x.left !== y.left ||
      x.width !== y.width ||
      x.height !== y.height
    )
      return false;
  }
  for (let i = 0; i < a.columns.length; i++) {
    const x = a.columns[i]!;
    const y = b.columns[i]!;
    if (
      x.id !== y.id ||
      x.top !== y.top ||
      x.left !== y.left ||
      x.width !== y.width ||
      x.height !== y.height
    )
      return false;
  }
  return true;
}

const BOOTSTRAP_SCRIPT = `
(function(){
  if (window.__letteraReady) return;
  window.__letteraReady = true;

  function nearestId(el){
    while(el && el !== document.body){
      if(el.dataset && el.dataset.letteraId) return el.dataset.letteraId;
      el = el.parentElement;
    }
    return null;
  }
  function infer(el){
    var t = (el.tagName || '').toLowerCase();
    if(t === 'td') return 'column';
    if(t === 'table'){
      var p = el.parentElement;
      // Block: <table data-lettera-id> directly inside the column <td>.
      if(p && p.tagName.toLowerCase() === 'td' && p.dataset.letteraId) return 'block';
      // Row: <table data-lettera-id> wrapped by the section's inner padding <td>
      // (which itself has NO data-lettera-id).
      if(p && p.tagName.toLowerCase() === 'td') return 'row';
      // Otherwise it's the section's outer table (parent is a div / body / tr).
      return 'section';
    }
    return 'block';
  }

  function postLayout(){
    var blocks = [];
    var columns = [];
    document.querySelectorAll('td[data-lettera-id]').forEach(function(td){
      var r = td.getBoundingClientRect();
      columns.push({id: td.dataset.letteraId, top: r.top + window.scrollY, left: r.left + window.scrollX, width: r.width, height: r.height});
    });
    document.querySelectorAll('td[data-lettera-id] > table[data-lettera-id]').forEach(function(t){
      var r = t.getBoundingClientRect();
      var col = t.parentElement;
      blocks.push({id: t.dataset.letteraId, columnId: col.dataset.letteraId, top: r.top + window.scrollY, left: r.left + window.scrollX, width: r.width, height: r.height});
    });
    parent.postMessage({source:'lettera', kind:'layout', height: document.body.scrollHeight, blocks: blocks, columns: columns}, '*');
  }

  // Coalesce repeated layout posts.
  var layoutPending = false;
  function scheduleLayout(){
    if(layoutPending) return;
    layoutPending = true;
    requestAnimationFrame(function(){
      layoutPending = false;
      postLayout();
    });
  }

  document.addEventListener('click', function(ev){
    var id = nearestId(ev.target);
    if(!id) return;
    ev.preventDefault();
    var el = document.querySelector('[data-lettera-id="' + id + '"]');
    var type = el ? infer(el) : 'block';
    parent.postMessage({source:'lettera', kind:'select', id: id, type: type}, '*');
  }, true);

  window.addEventListener('message', function(ev){
    var d = ev.data;
    if(!d || d.source !== 'lettera-host') return;
    if (d.kind === 'remeasure'){
      scheduleLayout();
    }
  });

  if(window.ResizeObserver){
    new ResizeObserver(scheduleLayout).observe(document.body);
  }
  scheduleLayout();
})();
`;

function buildSkeleton(): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;cursor:pointer;}*[data-lettera-id]{cursor:pointer;}</style><style data-lettera-styles></style><style data-lettera-selection></style><style data-lettera-hover></style></head><body><div id="lettera-root"></div><script>${BOOTSTRAP_SCRIPT}</script></body></html>`;
}

export function Canvas() {
  const doc = useEditorStore((s) => s.doc);
  const device = useEditorStore((s) => s.device);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const variables = useEditorStore((s) => s.variables);
  const schema = useEditorStore((s) => s.schema);
  const data = useEditorStore((s) => s.data);
  const setWarnings = useEditorStore((s) => s.setWarnings);
  const hoverId = useEditorStore((s) => s.hoverId);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [iframeReady, setIframeReady] = useState(false);

  const registry = getRegistry();

  const result = useMemo(
    () => render(doc, { registry, device, variables, schema, data, mode: 'preview' }),
    [doc, device, registry, variables, schema, data],
  );

  // Push warnings to store after render (effect avoids set-during-render).
  useEffect(() => {
    setWarnings(result.warnings);
  }, [result.warnings, setWarnings]);

  // Stable skeleton — never changes after mount, so the iframe never reloads.
  const initialSrcDoc = useMemo(
    () => buildSkeleton(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Single effect that updates style + content together. Updating the style
  // tag *before* mutating innerHTML guarantees the outline rule for the
  // selected id is in place at the very next style-resolution pass — there
  // is no async hop, no postMessage round-trip, and therefore no flicker.
  useEffect(() => {
    if (!iframeReady) return;
    const iframe = iframeRef.current;
    const idoc = iframe?.contentDocument;
    if (!iframe || !idoc) return;

    const parsed = new DOMParser().parseFromString(result.html, 'text/html');

    // Update head styles in our managed <style data-lettera-styles>.
    const newStyles = Array.from(parsed.head.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n');
    const styleEl = idoc.head.querySelector(
      'style[data-lettera-styles]',
    ) as HTMLStyleElement | null;
    if (styleEl && styleEl.textContent !== newStyles) {
      styleEl.textContent = newStyles;
    }

    // Selection outline — expressed as a CSS rule (NOT inline style on the
    // node), so it survives innerHTML swaps and applies on the very next
    // style pass without any post-render JS step.
    const selStyle = idoc.head.querySelector(
      'style[data-lettera-selection]',
    ) as HTMLStyleElement | null;
    const selRule = selection?.id
      ? `[data-lettera-id="${selection.id}"]{outline:2px solid #1f6feb;outline-offset:-2px;}`
      : '';
    if (selStyle && selStyle.textContent !== selRule) {
      selStyle.textContent = selRule;
    }

    // Mirror body background (renderer puts it as inline style on <body>).
    const bg = parsed.body.style.backgroundColor;
    if (bg && idoc.body.style.background !== bg) {
      idoc.body.style.background = bg;
    }

    // Replace the email content inside our managed root container.
    const root = idoc.getElementById('lettera-root');
    if (root) {
      root.innerHTML = parsed.body.innerHTML;
    }

    // Ask iframe to re-measure (gap overlay coords).
    iframe.contentWindow?.postMessage({ source: 'lettera-host', kind: 'remeasure' }, '*');
  }, [iframeReady, result.html, selection?.id]);

  // Hover outline — dashed blue, driven by the Layers panel. Written into
  // its own style tag so hover changes never touch `innerHTML` or the
  // selection rule, keeping the canvas flicker-free.
  useEffect(() => {
    if (!iframeReady) return;
    const idoc = iframeRef.current?.contentDocument;
    if (!idoc) return;
    const hoverStyle = idoc.head.querySelector(
      'style[data-lettera-hover]',
    ) as HTMLStyleElement | null;
    const rule =
      hoverId && hoverId !== selection?.id
        ? `[data-lettera-id="${hoverId}"]{outline:1px dashed #1f6feb;outline-offset:-1px;}`
        : '';
    if (hoverStyle && hoverStyle.textContent !== rule) {
      hoverStyle.textContent = rule;
    }
  }, [iframeReady, hoverId, selection?.id]);

  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const data = ev.data as {
        source?: string;
        kind?: string;
        id?: string;
        type?: string;
        height?: number;
        blocks?: BlockRect[];
        columns?: ColumnRect[];
      };
      if (data?.source !== 'lettera') return;
      if (data.kind === 'select' && data.id) {
        const t = (data.type ?? 'block') as 'section' | 'row' | 'column' | 'block';
        select({ id: data.id, type: t });
      } else if (data.kind === 'layout') {
        const next: Layout = {
          height: data.height ?? 0,
          blocks: data.blocks ?? [],
          columns: data.columns ?? [],
        };
        setLayout((prev) => (sameLayout(prev, next) ? prev : next));
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [select]);

  const iframeStyle = layout?.height ? { height: `${layout.height}px` } : undefined;

  return (
    <div
      className={
        'lettera-editor__canvas' + (device === 'mobile' ? ' lettera-editor__canvas--mobile' : '')
      }
    >
      <div className="lettera-editor__canvas-stage" style={iframeStyle}>
        <iframe
          ref={iframeRef}
          title="Email preview"
          srcDoc={initialSrcDoc}
          sandbox="allow-same-origin allow-scripts"
          style={iframeStyle}
          onLoad={() => setIframeReady(true)}
        />
        {layout && <DropOverlay layout={layout} />}
      </div>
    </div>
  );
}

function DropOverlay({ layout }: { layout: Layout }) {
  const dnd = useDndContext();
  const isDragging = !!dnd.active;

  // Build "gap" zones per column. For each column:
  //   gap 0: above the first block (or whole column if empty)
  //   gap i: between block i-1 and block i
  //   gap n: below the last block
  const gaps = useMemo(() => {
    const out: Array<{ id: string; top: number; left: number; width: number; height: number }> = [];
    for (const col of layout.columns) {
      const blocks = layout.blocks
        .filter((b) => b.columnId === col.id)
        .sort((a, b) => a.top - b.top);

      if (blocks.length === 0) {
        out.push({
          id: `${GAP_PREFIX}${col.id}:0`,
          top: col.top,
          left: col.left,
          width: col.width,
          height: Math.max(col.height, 32),
        });
        continue;
      }

      // gap 0: above first block
      out.push({
        id: `${GAP_PREFIX}${col.id}:0`,
        top: col.top,
        left: col.left,
        width: col.width,
        height: Math.max(blocks[0]!.top - col.top + 6, 12),
      });

      // gap between blocks
      for (let i = 1; i < blocks.length; i++) {
        const prev = blocks[i - 1]!;
        const cur = blocks[i]!;
        const top = prev.top + prev.height - 6;
        const height = Math.max(cur.top - (prev.top + prev.height) + 12, 12);
        out.push({
          id: `${GAP_PREFIX}${col.id}:${i}`,
          top,
          left: col.left,
          width: col.width,
          height,
        });
      }

      // tail gap
      const last = blocks[blocks.length - 1]!;
      const tailTop = last.top + last.height - 6;
      const tailHeight = Math.max(col.top + col.height - (last.top + last.height) + 12, 12);
      out.push({
        id: `${GAP_PREFIX}${col.id}:${blocks.length}`,
        top: tailTop,
        left: col.left,
        width: col.width,
        height: tailHeight,
      });
    }
    return out;
  }, [layout]);

  return (
    <div
      className="lettera-editor__drop-overlay"
      style={{ pointerEvents: isDragging ? 'auto' : 'none' }}
      aria-hidden
    >
      {gaps.map((g) => (
        <GapDropzone key={g.id} {...g} active={isDragging} />
      ))}
    </div>
  );
}

interface GapProps {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
  active: boolean;
}

function GapDropzone({ id, top, left, width, height, active }: GapProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  // We render two visual layers: a transparent hit area covering the full
  // gap rect (for forgiving drop targeting), and a thin 2px insertion line
  // centered in the gap that lights up when hovered.
  return (
    <div
      ref={setNodeRef}
      className="lettera-editor__drop-gap"
      style={{
        position: 'absolute',
        top,
        left,
        width,
        height,
        opacity: active ? 1 : 0,
        pointerEvents: active ? 'auto' : 'none',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          width: '100%',
          height: 2,
          marginTop: -1,
          background: isOver ? '#1f6feb' : 'rgba(31,111,235,0.25)',
          boxShadow: isOver ? '0 0 0 3px rgba(31,111,235,0.18)' : undefined,
          transition: 'background 80ms ease, box-shadow 80ms ease',
          borderRadius: 2,
        }}
      />
    </div>
  );
}
