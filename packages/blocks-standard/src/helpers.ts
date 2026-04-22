/**
 * Shared rendering helpers used by every standard block's `exportRender`.
 *
 * These are deliberately small, pure, and Outlook-aware. They stay here (in
 * `blocks-standard`) rather than `renderer` because they are useful to plugin
 * authors who write their own `exportRender` functions — the block package
 * is a natural place for "block-author utilities".
 */

import type { Spacing, StyleDelta } from '@lettera/core';
import type { InspectorControl, InspectorSchema, RenderContext } from '@lettera/sdk';
import sanitizeHtmlLib from 'sanitize-html';

/**
 * Build the canonical single-tab/single-group inspector for a standard block.
 * Every block in this package shares the same shell — content tab, one
 * group labelled with the block name. This helper removes the boilerplate.
 */
export function defineInspector(label: string, controls: InspectorControl[]): InspectorSchema {
  return {
    tabs: [
      {
        id: 'content',
        label: 'Content',
        groups: [{ id: 'g', label, controls }],
      },
    ],
  };
}

/** Resolve a spacing object to a `padding`/`margin` CSS string in px. */
export function spacingToCss(ctx: RenderContext, spacing: Spacing | undefined): string | undefined {
  if (!spacing) return undefined;
  const t = ctx.resolve<number>(spacing.top) ?? 0;
  const r = ctx.resolve<number>(spacing.right) ?? 0;
  const b = ctx.resolve<number>(spacing.bottom) ?? 0;
  const l = ctx.resolve<number>(spacing.left) ?? 0;
  return `${t}px ${r}px ${b}px ${l}px`;
}

/** Build a CSS `style` attribute string from a StyleDelta (base scope only). */
export function styleAttr(
  ctx: RenderContext,
  styles: StyleDelta | undefined,
  extra: Record<string, string | undefined> = {},
): string {
  const parts: string[] = [];
  if (styles?.background?.color) {
    const c = ctx.resolve<string>(styles.background.color);
    if (c) parts.push(`background-color:${c}`);
  }
  if (styles?.color) {
    const c = ctx.resolve<string>(styles.color);
    if (c) parts.push(`color:${c}`);
  }
  const padding = spacingToCss(ctx, styles?.padding);
  if (padding) parts.push(`padding:${padding}`);
  if (styles?.align) parts.push(`text-align:${styles.align}`);
  if (styles?.border) {
    const w = styles.border.width;
    // Width 0/undefined means "no border" — emitting `border:1px solid` here
    // would cause a stray hairline whenever a colour is set without a width.
    if (typeof w === 'number' && w > 0) {
      const s = styles.border.style ?? 'solid';
      const c = ctx.resolve<string>(styles.border.color) ?? '#000000';
      parts.push(`border:${w}px ${s} ${c}`);
    }
    const r = ctx.resolve<number>(styles.border.radius);
    if (typeof r === 'number' && r > 0) parts.push(`border-radius:${r}px`);
  }
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined) parts.push(`${k}:${v}`);
  }
  return parts.join(';');
}

/** Apply a semantic text style by name to a CSS object. */
export function semanticTextStyleCss(ctx: RenderContext, styleRef: string): string {
  const styles = ctx.theme.typography.semanticStyles as Record<string, unknown>;
  const s = styles[styleRef] as
    | {
        family: 'heading' | 'body' | 'mono';
        size: number;
        weight: number;
        lineHeight: number;
        letterSpacing?: number;
        color?: string | { $token: string };
        textTransform?: string;
      }
    | undefined;
  if (!s) return '';
  const families = ctx.theme.typography.families as Record<string, string[] | undefined>;
  const stack = families[s.family] ?? families.body ?? ['Arial', 'sans-serif'];
  const parts = [
    `font-family:${stack.map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(', ')}`,
    `font-size:${s.size}px`,
    `font-weight:${s.weight}`,
    `line-height:${s.lineHeight}`,
  ];
  if (s.letterSpacing) parts.push(`letter-spacing:${s.letterSpacing}px`);
  if (s.textTransform) parts.push(`text-transform:${s.textTransform}`);
  const color = ctx.resolve<string>(s.color);
  if (color) parts.push(`color:${color}`);
  return parts.join(';');
}

/**
 * Inline typography overrides shared by Heading / Text / Button. Each field
 * is optional; only the provided ones are emitted, and they are intended to
 * be appended **after** any preset CSS so they win the CSS cascade.
 */
export interface TypographyOverrides {
  fontSize?: number;
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  fontWeight?: number;
}

export function typographyOverridesCss(o: TypographyOverrides | undefined): string {
  if (!o) return '';
  const parts: string[] = [];
  if (typeof o.fontSize === 'number' && o.fontSize > 0) parts.push(`font-size:${o.fontSize}px`);
  if (typeof o.lineHeight === 'number' && o.lineHeight > 0)
    parts.push(`line-height:${o.lineHeight}`);
  if (typeof o.letterSpacing === 'number') parts.push(`letter-spacing:${o.letterSpacing}px`);
  if (o.textTransform) parts.push(`text-transform:${o.textTransform}`);
  if (typeof o.fontWeight === 'number') parts.push(`font-weight:${o.fontWeight}`);
  return parts.join(';');
}

/** Wrap a fragment in a single-cell table — the email-safe div equivalent. */
export function tableWrap(
  inner: string,
  attrs: { width?: string | number; align?: string; bgColor?: string } = {},
): string {
  const width = attrs.width !== undefined ? ` width="${attrs.width}"` : '';
  const align = attrs.align ? ` align="${attrs.align}"` : '';
  const bg = attrs.bgColor ? ` bgcolor="${attrs.bgColor}"` : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${width}${align}${bg} style="border-collapse:collapse"><tr><td>${inner}</td></tr></table>`;
}

// ---------------------------------------------------------------------------
// Security helpers
// ---------------------------------------------------------------------------

/**
 * Whitelisted URL schemes for `href` / `src` attributes in rendered email.
 * Explicitly rejects `javascript:`, `data:`, `vbscript:`, `file:` — any input
 * that doesn't match this whitelist is replaced with `#` at render time.
 */
const SAFE_URL_RE = /^(https?:\/\/|mailto:|tel:|#|\/|\.{1,2}\/)/i;

export function isSafeUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (trimmed.length === 0) return false;
  // Reject NUL/control characters that might smuggle scheme boundaries.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: explicit rejection
  if (/[\0-\x1F\x7F]/.test(trimmed)) return false;
  return SAFE_URL_RE.test(trimmed);
}

/**
 * Return a safe version of the given URL — the original if it passes
 * `isSafeUrl`, otherwise `'#'`. Callers should still HTML-escape the result
 * before embedding it in an attribute.
 */
export function safeUrl(url: string | undefined | null): string {
  return isSafeUrl(url) ? (url as string).trim() : '#';
}

/**
 * Sanitize block-level rich HTML (Tiptap output, raw HTML block).
 *
 * Allows only elements + attributes that make sense inside a marketing-email
 * paragraph/heading/button label. Everything else (scripts, event handlers,
 * iframes, style attributes, javascript:/data: URLs) is stripped before the
 * string reaches the render output.
 */
const BLOCK_TAGS = [
  'a',
  'b',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'i',
  'ins',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'u',
  'ul',
];

const BLOCK_ATTRS: sanitizeHtmlLib.IOptions['allowedAttributes'] = {
  a: ['href', 'name', 'target', 'rel', 'title'],
  span: ['data-lettera-var', 'data-lettera-var-name'],
  '*': ['class'],
};

export function sanitizeBlockHtml(html: string): string {
  return sanitizeHtmlLib(html, {
    allowedTags: BLOCK_TAGS,
    allowedAttributes: BLOCK_ATTRS,
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: false,
  });
}

/**
 * Sanitize a raw HTML block. Stricter than `sanitizeBlockHtml` — still rejects
 * scripts/styles/iframes/event handlers but permits table/img/div/section
 * markup that advanced users sometimes paste in.
 */
const RAW_TAGS = [
  ...BLOCK_TAGS,
  'div',
  'section',
  'article',
  'header',
  'footer',
  'nav',
  'aside',
  'figure',
  'figcaption',
  'hr',
  'img',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'col',
  'colgroup',
];

const RAW_ATTRS: sanitizeHtmlLib.IOptions['allowedAttributes'] = {
  ...BLOCK_ATTRS,
  img: ['src', 'alt', 'width', 'height', 'title'],
  table: ['role', 'cellpadding', 'cellspacing', 'border', 'width', 'align', 'bgcolor'],
  td: ['align', 'valign', 'width', 'colspan', 'rowspan'],
  th: ['align', 'valign', 'width', 'colspan', 'rowspan'],
  '*': ['class', 'id', 'style'],
};

export function sanitizeRawHtml(html: string): string {
  return sanitizeHtmlLib(html, {
    allowedTags: RAW_TAGS,
    allowedAttributes: RAW_ATTRS,
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'cid'],
    allowedSchemesByTag: { img: ['http', 'https', 'cid'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: false,
    // Drop all style:url(...) / expression(...) payloads; keep plain CSS decls.
    allowedStyles: {
      '*': {
        color: [/^[\w#().,%\s-]+$/],
        'background-color': [/^[\w#().,%\s-]+$/],
        'text-align': [/^(left|right|center|justify)$/],
        'font-size': [/^\d+(\.\d+)?(px|em|rem|%)$/],
        'font-weight': [/^(bold|normal|\d{3})$/],
        padding: [/^[\d.,\s%a-z-]+$/],
        margin: [/^[\d.,\s%a-z-]+$/],
        border: [/^[\d.,\s%a-z#()-]+$/],
        'border-radius': [/^[\d.,\s%a-z-]+$/],
        width: [/^\d+(\.\d+)?(px|em|rem|%)$/],
        height: [/^\d+(\.\d+)?(px|em|rem|%)$/],
      },
    },
  });
}

/** Re-export sanitize-html lib for advanced plugin authors that need overrides. */
export { sanitizeHtmlLib };
