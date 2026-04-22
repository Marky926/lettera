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

// ---------------------------------------------------------------------------
// Escape / sanitize primitives — exported so plugin authors can build their
// own block renderers without re-deriving the escape rules. NEVER concatenate
// untrusted strings into HTML/CSS without one of these.
// ---------------------------------------------------------------------------

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** HTML-attribute-safe escape. Use for values inside `attr="…"`. */
export function escapeAttr(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c] ?? c);
}

/**
 * Strict CSS-value validator. Returns the input only if it matches a small
 * whitelist of characters that cannot break out of a `style="…"` declaration
 * (no `"`, `;`, `<`, `>` and no `expression(`/`url(` or backslash escapes).
 *
 * Use for any theme-resolved or user-supplied value that is concatenated into
 * an inline `style` attribute. If the value fails validation it returns
 * `undefined` and the caller should drop the property and emit a warning.
 */
const CSS_SAFE_VALUE_RE = /^[#a-zA-Z0-9(),.%/\s_-]+$/;
const CSS_DANGEROUS_RE = /\b(expression|url|@import|behavior|javascript|vbscript)\b/i;

export function safeCssValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  if (s.length === 0) return undefined;
  if (!CSS_SAFE_VALUE_RE.test(s)) return undefined;
  if (CSS_DANGEROUS_RE.test(s)) return undefined;
  return s;
}

/** CSS keyword whitelist helper — returns the value if listed, else undefined. */
export function safeCssKeyword<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value);
  return (allowed as readonly string[]).includes(s) ? (s as T) : undefined;
}

/** Validated `border-style` keyword set (subset that renders consistently in mail). */
export const BORDER_STYLE_KEYWORDS = ['solid', 'dashed', 'dotted', 'double', 'none'] as const;
/** Validated `text-align` keyword set. */
export const TEXT_ALIGN_KEYWORDS = ['left', 'right', 'center', 'justify'] as const;
/** Validated `text-transform` keyword set. */
export const TEXT_TRANSFORM_KEYWORDS = ['none', 'uppercase', 'lowercase', 'capitalize'] as const;

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

/**
 * Build a CSS `style` attribute string from a StyleDelta (base scope only).
 *
 * Every theme-resolved value is run through {@link safeCssValue} so a
 * malicious token (e.g. `red; }body{display:none`) cannot break out of the
 * inline declaration. Rejected values are dropped silently — the upstream
 * theme validation is expected to surface them.
 */
export function styleAttr(
  ctx: RenderContext,
  styles: StyleDelta | undefined,
  extra: Record<string, string | undefined> = {},
): string {
  const parts: string[] = [];
  if (styles?.background?.color) {
    const c = safeCssValue(ctx.resolve<string>(styles.background.color));
    if (c) parts.push(`background-color:${c}`);
  }
  if (styles?.color) {
    const c = safeCssValue(ctx.resolve<string>(styles.color));
    if (c) parts.push(`color:${c}`);
  }
  const padding = spacingToCss(ctx, styles?.padding);
  if (padding) parts.push(`padding:${padding}`);
  if (styles?.align) {
    const a = safeCssKeyword(styles.align, TEXT_ALIGN_KEYWORDS);
    if (a) parts.push(`text-align:${a}`);
  }
  if (styles?.border) {
    const w = styles.border.width;
    // Width 0/undefined means "no border" — emitting `border:1px solid` here
    // would cause a stray hairline whenever a colour is set without a width.
    if (typeof w === 'number' && w > 0) {
      const sKw = safeCssKeyword(styles.border.style ?? 'solid', BORDER_STYLE_KEYWORDS) ?? 'solid';
      const c = safeCssValue(ctx.resolve<string>(styles.border.color)) ?? '#000000';
      parts.push(`border:${w}px ${sKw} ${c}`);
    }
    const r = ctx.resolve<number>(styles.border.radius);
    if (typeof r === 'number' && r > 0) parts.push(`border-radius:${r}px`);
  }
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) continue;
    // `extra` is caller-controlled so we still validate; numeric callers like
    // `text-align:${dir}` wouldn't go through Zod.
    const safe = safeCssValue(v);
    if (safe) parts.push(`${k}:${safe}`);
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
  // Drop family entries containing `"`, `;`, `<`, `>` — they would close the
  // attribute or break out of the declaration list.
  const safeStack = stack.filter((f) => /^[\w\s.-]+$/.test(f));
  const fontFamilyParts = safeStack.length > 0 ? safeStack : ['Arial', 'sans-serif'];
  const parts = [
    `font-family:${fontFamilyParts.map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(', ')}`,
    `font-size:${Number(s.size)}px`,
    `font-weight:${Number(s.weight)}`,
    `line-height:${Number(s.lineHeight)}`,
  ];
  if (typeof s.letterSpacing === 'number') parts.push(`letter-spacing:${s.letterSpacing}px`);
  const tt = safeCssKeyword(s.textTransform, TEXT_TRANSFORM_KEYWORDS);
  if (tt) parts.push(`text-transform:${tt}`);
  const color = safeCssValue(ctx.resolve<string>(s.color));
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
  // All numeric inputs are coerced via Number() so a stray string injected
  // into the document JSON cannot smuggle CSS — NaN gets dropped below.
  if (typeof o.fontSize === 'number' && o.fontSize > 0) {
    parts.push(`font-size:${Number(o.fontSize)}px`);
  }
  if (typeof o.lineHeight === 'number' && o.lineHeight > 0) {
    parts.push(`line-height:${Number(o.lineHeight)}`);
  }
  if (typeof o.letterSpacing === 'number') {
    parts.push(`letter-spacing:${Number(o.letterSpacing)}px`);
  }
  const tt = safeCssKeyword(o.textTransform, TEXT_TRANSFORM_KEYWORDS);
  if (tt) parts.push(`text-transform:${tt}`);
  if (typeof o.fontWeight === 'number') parts.push(`font-weight:${Number(o.fontWeight)}`);
  return parts.join(';');
}

/**
 * Wrap a fragment in a single-cell table — the email-safe div equivalent.
 *
 * All attribute values are HTML-escaped via {@link escapeAttr} so callers
 * (including third-party plugin authors) cannot accidentally introduce
 * attribute breakout via a stray `"` in user-controlled props.
 */
export function tableWrap(
  inner: string,
  attrs: { width?: string | number; align?: string; bgColor?: string } = {},
): string {
  const width = attrs.width !== undefined ? ` width="${escapeAttr(attrs.width)}"` : '';
  const align = attrs.align ? ` align="${escapeAttr(attrs.align)}"` : '';
  const bg = attrs.bgColor ? ` bgcolor="${escapeAttr(attrs.bgColor)}"` : '';
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
  // `data-lettera-var*` markers drive variable substitution; the editor's
  // Tiptap extension inserts them into trusted block HTML. Allowed here so
  // they survive sanitisation, but the renderer validates the variable path
  // before resolving it (see `renderTag`).
  span: ['data-lettera-var', 'data-lettera-var-name'],
  '*': ['class'],
};

/**
 * Auto-add `rel="noopener noreferrer"` whenever an `<a>` opens a new tab.
 * Webmail clients that honour `target="_blank"` are otherwise vulnerable to
 * reverse-tabnabbing (the linked page can rewrite `window.opener.location`).
 */
function hardenAnchor(_tagName: string, attribs: Record<string, string>) {
  if (attribs.target === '_blank') {
    const existing = (attribs.rel ?? '').split(/\s+/).filter(Boolean);
    for (const required of ['noopener', 'noreferrer']) {
      if (!existing.includes(required)) existing.push(required);
    }
    attribs.rel = existing.join(' ');
  }
  return { tagName: 'a', attribs };
}

export function sanitizeBlockHtml(html: string): string {
  return sanitizeHtmlLib(html, {
    allowedTags: BLOCK_TAGS,
    allowedAttributes: BLOCK_ATTRS,
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: false,
    transformTags: { a: hardenAnchor },
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
    transformTags: { a: hardenAnchor },
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
