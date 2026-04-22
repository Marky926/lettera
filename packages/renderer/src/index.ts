/**
 * Email document → email-safe HTML renderer.
 *
 * Architecture:
 *   1. Walk the AST (Section → Row → Column → Block) emitting table-based HTML.
 *   2. Per-block content is delegated to `BlockDefinition.exportRender` from
 *      the supplied `BlockRegistry`.
 *   3. Responsive: per-node mobile overrides are emitted as scoped CSS in
 *      `<head>` with `data-lettera-id` selectors and a `@media (max-width:600px)`
 *      block. Single-column stacking is handled the same way.
 *   4. The result is a complete HTML document ready to be inlined (juice will
 *      be added in `inline.ts` once the surface is stable).
 *
 * Returns `{ html, text, warnings }`. `text` is a stripped plain-text version
 * derived from the same AST (so plain text never goes out of sync with HTML).
 */
import type {
  Block,
  Column,
  ConditionalBlock,
  EmailDocument,
  MergeTagFormatter,
  RepeaterBlock,
  Row,
  Section,
  StyleDelta,
  ThemeTokens,
  VariableContext,
  VariableDefinition,
  VariableSchema,
  VariableSchemaNode,
} from '@lettera/core';
import {
  columnWidthToPercent,
  defaultFormatters,
  defaultMergeTagFormatter,
  type FormatterRegistry,
  findVariable,
  flatVariablesToSchema,
  parseFormatterSpec,
  resolveSchemaPath,
  resolveValue,
  resolveValuePath,
  safeEval,
} from '@lettera/core';
import type { LintResult, RenderContext } from '@lettera/sdk';
import { cssEscape, escapeHtml, htmlToText } from './html.js';
import type { BlockRegistry } from './registry.js';

export interface RenderOptions {
  registry: BlockRegistry;
  device?: 'desktop' | 'mobile';
  /** Optional override; defaults to a sensible head template. */
  preheader?: string;
  /** Variables exposed by the host system (merge tags). */
  variables?: readonly VariableDefinition[];
  /**
   * Typed variable schema (preferred over flat `variables` when present).
   * Combined with `data` it lets the renderer resolve nested paths, list
   * items, and apply schema-driven formatting (currency, date, …) without
   * the template author writing explicit pipes.
   */
  schema?: VariableSchema;
  /** Runtime variable values. Used in preview substitution and for export when the host wants concrete values rather than merge tags. */
  data?: VariableContext;
  /** Custom formatter registry. Defaults to `defaultFormatters`. */
  formatters?: FormatterRegistry;
  /**
   * 'export' (default) emits merge-tag syntax via `mergeTagFormatter`.
   * 'preview' substitutes `sampleValue` so the editor canvas shows realistic content.
   */
  mode?: 'preview' | 'export';
  /** Customise merge tag syntax (Mailchimp, SendGrid, etc.). */
  mergeTagFormatter?: MergeTagFormatter;
}

export interface RenderResult {
  html: string;
  text: string;
  warnings: LintResult[];
}

interface ResponsiveRule {
  selector: string;
  declarations: string;
}

export function render(doc: EmailDocument, opts: RenderOptions): RenderResult {
  const warnings: LintResult[] = [];
  const responsiveRules: ResponsiveRule[] = [];
  const variables = opts.variables ?? [];
  const mode = opts.mode ?? 'export';
  const formatter = opts.mergeTagFormatter ?? defaultMergeTagFormatter;
  const formatters = opts.formatters ?? defaultFormatters;

  // The typed schema is the new path. We synthesise one from the flat list
  // when the host hasn't supplied an explicit schema, so internal lookup code
  // can always assume `schema` is present.
  const schema: VariableSchema = opts.schema ?? flatVariablesToSchema(variables);
  const data: VariableContext = opts.data ?? {};

  /** Sample-value resolver used in preview mode. Prefers real `data`, then
   *  falls back to the schema's `sample` for the leaf. Returns `''` when
   *  neither is available (so missing data renders as empty, not `undefined`). */
  const sampleFor = (path: string): string => {
    const live = resolveValuePath(data, path);
    if (live != null) return formatScalar(live, resolveSchemaPath(schema, path), formatters);
    const node = resolveSchemaPath(schema, path);
    if (node && node.kind !== 'object' && node.kind !== 'list' && node.sample != null) {
      return formatScalar(node.sample, node, formatters);
    }
    // Legacy flat fallback so hosts that only pass `variables` still see samples.
    return findVariable(variables, path)?.sampleValue ?? '';
  };

  const ctx: RenderContext = {
    doc,
    theme: doc.theme,
    device: opts.device ?? 'desktop',
    mode,
    variables,
    schema,
    data,
    escape: escapeHtml,
    resolve: <T>(value: T | { $token: string } | undefined) =>
      resolveValue<T>(doc.theme, value as T | { $token: string } | undefined),
    formatMergeTag: (path) => formatter({ path, variable: findVariable(variables, path) }),
    resolveVariable: sampleFor,
    evaluate: (source, scope) => safeEval(source, data, scope),
    warn(message, w) {
      warnings.push({
        code: w?.code ?? 'render.warning',
        severity: 'warn',
        message,
        ...(w?.nodeId ? { nodeId: w.nodeId } : {}),
        ...(w?.quickFixes ? { quickFixes: w.quickFixes } : {}),
      });
    },
  };

  const bodyHtml = doc.root
    .map((section) => renderSection(section, ctx, opts, responsiveRules))
    .join('\n');

  const headStyles = buildHeadStyles(doc.theme, responsiveRules);

  const preheader = opts.preheader ?? doc.metadata.preheader ?? '';
  const subject = doc.metadata.subject ?? doc.metadata.name ?? 'Untitled';

  // Body / page settings (with theme fallbacks).
  const body = doc.body ?? { contentWidth: 600 };
  const canvasBg =
    ctx.resolve<string>(body.canvasBackground?.color) ??
    doc.theme.color.surface.subtle ??
    '#F4F6FA';
  const bodyTextColor = ctx.resolve<string>(body.textColor) ?? doc.theme.color.text.default;
  const bodyFont =
    body.fontFamily ??
    doc.theme.typography.families.body.map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(', ');
  const bodyLink = ctx.resolve<string>(body.linkColor) ?? doc.theme.color.brand.primary;

  const html = `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>${escapeHtml(subject)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>${headStyles}
a { color:${bodyLink}; }
</style>
</head>
<body style="margin:0;padding:0;background-color:${canvasBg};color:${bodyTextColor};font-family:${bodyFont};">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(substituteVariables(preheader, ctx))}</div>` : ''}
<div role="article" aria-roledescription="email" lang="en">
${bodyHtml}
</div>
</body>
</html>`;

  return {
    html: substituteVariables(html, ctx),
    text: substituteVariables(extractPlainText(doc), ctx),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Section / Row / Column
// ---------------------------------------------------------------------------

/**
 * Common entry for any node: collect responsive overrides into the shared
 * rules buffer and report whether the node should be emitted on desktop.
 */
function visit(
  node: {
    id: string;
    hidden?: { desktop?: boolean };
    responsive?: { mobile?: { styles?: StyleDelta; hidden?: boolean } };
  },
  rules: ResponsiveRule[],
): boolean {
  collectMobileOverrides(node, rules);
  return !node.hidden?.desktop;
}

function renderSection(
  section: Section,
  ctx: RenderContext,
  opts: RenderOptions,
  rules: ResponsiveRule[],
): string {
  if (!visit(section, rules)) return '';

  const docBody = ctx.doc.body ?? { contentWidth: 600 };
  const contentWidth = section.props.contentWidth ?? docBody.contentWidth ?? 600;
  const sectionBg =
    ctx.resolve<string>(section.styles?.background?.color) ??
    ctx.resolve<string>(docBody.contentBackground?.color) ??
    ctx.theme.color.surface.default;
  const padding =
    paddingCss(ctx, section.styles) ??
    paddingCss(ctx, { padding: docBody.padding } as StyleDelta) ??
    '24px';

  const innerRows =
    section.children.length === 0 && opts.mode === 'preview'
      ? `<div data-lettera-empty="section" style="min-height:80px;display:flex;align-items:center;justify-content:center;border:1px dashed #c4cdd9;border-radius:6px;color:#6b7280;font:13px system-ui,-apple-system,sans-serif;padding:16px;text-align:center;">Empty section — open the inspector to add a row layout</div>`
      : section.children.map((r) => renderRow(r, ctx, opts, rules)).join('\n');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${sectionBg}" data-lettera-id="${escapeHtml(section.id)}" style="background-color:${sectionBg};border-collapse:collapse;${section.hidden?.mobile ? 'mso-hide:none;' : ''}">
  <tr><td align="center" style="padding:0">
    <table class="lettera-section-inner" role="presentation" cellpadding="0" cellspacing="0" border="0" width="${contentWidth}" style="width:${contentWidth}px;max-width:100%;border-collapse:collapse">
      <tr><td style="padding:${padding}">
        ${innerRows}
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

function renderRow(
  row: Row,
  ctx: RenderContext,
  opts: RenderOptions,
  rules: ResponsiveRule[],
): string {
  if (!visit(row, rules)) return '';

  // Stacking on mobile: each column gets a class that drops to 100% width.
  const cells = row.children
    .map((col) => {
      collectMobileOverrides(col, rules);
      const width = columnWidthToPercent(col.props.width);
      const valign = col.props.verticalAlign ?? 'top';
      const stackClass = `lettera-col`;
      const blocks = col.children
        .map((b) => renderBlock(b, ctx, opts, rules))
        .filter(Boolean)
        .join('\n');
      return `<td class="${stackClass}" valign="${valign}" width="${width}%" data-lettera-id="${escapeHtml(col.id)}" style="width:${width}%;vertical-align:${valign};${col.hidden?.mobile ? 'mso-hide:none;' : ''}">
        ${blocks}
      </td>`;
    })
    .join('\n');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" data-lettera-id="${escapeHtml(row.id)}" style="border-collapse:collapse">
    <tr>${cells}</tr>
  </table>`;
}

function renderBlock(
  block: Block,
  ctx: RenderContext,
  opts: RenderOptions,
  rules: ResponsiveRule[],
): string {
  if (!visit(block, rules)) return '';

  // Dynamic blocks (repeater/conditional) don't have a registry entry — they
  // expand into their child blocks based on the runtime data context.
  if (block.type === 'block.repeater') {
    return renderRepeater(block, ctx, opts, rules);
  }
  if (block.type === 'block.conditional') {
    return renderConditional(block, ctx, opts, rules);
  }

  const def = opts.registry.get(block.type);
  if (!def) {
    ctx.warn(`No renderer registered for block type "${block.type}"`, {
      code: 'renderer.unknown-block',
      nodeId: block.id,
      quickFixes: [{ label: 'Remove block', commandType: 'doc/remove', payload: { id: block.id } }],
    });
    return `<!-- unknown block ${block.type} -->`;
  }

  // Validate props against the block's schema; surface any errors as warnings
  // but still attempt to render with whatever values exist.
  const parsed = def.propsSchema.safeParse(block.props);
  if (!parsed.success) {
    ctx.warn(
      `Block ${block.type} has invalid props: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      { code: 'renderer.invalid-props', nodeId: block.id },
    );
  }

  const inner = def.exportRender({ node: block as never, ctx });
  // Wrap each block in a single-cell row so block-level padding/background
  // works in clients that ignore <div> margins (looking at you, Outlook).
  const wrapperPadding = paddingCss(ctx, block.styles) ?? '0';
  const wrapperBg = ctx.resolve<string>(block.styles?.background?.color);
  const bgAttr = wrapperBg ? ` bgcolor="${wrapperBg}"` : '';
  const bgStyle = wrapperBg ? `background-color:${wrapperBg};` : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" data-lettera-id="${escapeHtml(block.id)}"${bgAttr} style="border-collapse:collapse;${bgStyle}">
    <tr><td style="padding:${wrapperPadding}">${inner}</td></tr>
  </table>`;
}

// ---------------------------------------------------------------------------
// Dynamic blocks (repeater, conditional)
// ---------------------------------------------------------------------------

/**
 * Render a repeater. When `data` is bound and the source resolves to an array
 * the body is emitted once per item, with the alias from `props.as` shadowing
 * the root data context. Otherwise the body is rendered once as a template
 * preview (so the editor canvas isn't empty without bound data).
 */
function renderRepeater(
  block: RepeaterBlock,
  ctx: RenderContext,
  opts: RenderOptions,
  rules: ResponsiveRule[],
): string {
  const items = block.props.source ? resolveValuePath(ctx.data ?? {}, block.props.source) : null;

  const children = block.children ?? [];
  if (!Array.isArray(items)) {
    if (block.props.emptyText && items != null) {
      return `<!-- repeater empty -->${ctx.escape(block.props.emptyText)}`;
    }
    // No real data — render the template body once as a preview. If the
    // repeater is brand new and has no children yet, surface a visible
    // placeholder in preview mode so the author can see what they added.
    if (children.length === 0 && ctx.mode === 'preview') {
      const src = block.props.source || '(no source)';
      return `<div data-lettera-id="${ctx.escape(block.id)}" style="border:1px dashed #94a3b8;border-radius:6px;padding:12px;color:#475569;font:12px system-ui;background:#f8fafc;">Repeater · ${ctx.escape(src)} as <b>${ctx.escape(block.props.as || 'item')}</b> — drop blocks inside to use as template</div>`;
    }
    return children.map((c) => renderBlock(c, ctx, opts, rules)).join('\n');
  }

  if (items.length === 0 && block.props.emptyText) {
    return ctx.escape(block.props.emptyText);
  }

  const alias = block.props.as || 'item';
  const sourceNode = ctx.schema ? resolveSchemaPath(ctx.schema, block.props.source) : undefined;
  const schemaScope: Record<string, VariableSchemaNode> | undefined =
    sourceNode && sourceNode.kind === 'list' ? { [alias]: sourceNode.item } : undefined;
  const out: string[] = [];
  for (const item of items) {
    const scope: Readonly<Record<string, unknown>> = { [alias]: item };
    const html = children.map((c) => renderBlock(c, ctx, opts, rules)).join('\n');
    // Bake scoped values into this iteration's HTML so the global substitution
    // pass can't accidentally replace `{{service.name}}` with a wrong scope.
    out.push(substituteVariables(html, ctx, scope, schemaScope));
  }
  return out.join('\n');
}

/**
 * Render a conditional. With bound data: the `when` expression decides
 * children vs `else`. Without data: render children unconditionally so the
 * canvas shows the primary branch as a template preview.
 */
function renderConditional(
  block: ConditionalBlock,
  ctx: RenderContext,
  opts: RenderOptions,
  rules: ResponsiveRule[],
): string {
  const evaluator = ctx.evaluate;
  const hasData = ctx.data && Object.keys(ctx.data).length > 0;
  let truthy = true;
  if (hasData && evaluator && block.props.when) {
    const result = evaluator(block.props.when);
    truthy =
      result != null &&
      result !== false &&
      result !== 0 &&
      result !== '' &&
      !(Array.isArray(result) && result.length === 0);
  }
  const branch = truthy ? (block.children ?? []) : (block.else ?? []);
  if (branch.length === 0 && ctx.mode === 'preview') {
    return `<div data-lettera-id="${ctx.escape(block.id)}" style="border:1px dashed #94a3b8;border-radius:6px;padding:12px;color:#475569;font:12px system-ui;background:#f8fafc;">If · ${ctx.escape(block.props.when || '(no condition)')} — drop blocks inside</div>`;
  }
  return branch.map((c) => renderBlock(c, ctx, opts, rules)).join('\n');
}

// ---------------------------------------------------------------------------
// Responsive
// ---------------------------------------------------------------------------

function collectMobileOverrides(
  node: { id: string; responsive?: { mobile?: { styles?: StyleDelta; hidden?: boolean } } },
  rules: ResponsiveRule[],
): void {
  const mobile = node.responsive?.mobile;
  if (!mobile) return;
  const decls: string[] = [];
  if (mobile.hidden) decls.push('display:none !important', 'max-height:0 !important');
  if (mobile.styles?.padding) {
    const s = mobile.styles.padding;
    const t = (s.top as number | undefined) ?? 0;
    const r = (s.right as number | undefined) ?? 0;
    const b = (s.bottom as number | undefined) ?? 0;
    const l = (s.left as number | undefined) ?? 0;
    decls.push(`padding:${t}px ${r}px ${b}px ${l}px !important`);
  }
  if (mobile.styles?.align) decls.push(`text-align:${mobile.styles.align} !important`);
  if (decls.length === 0) return;
  rules.push({
    selector: `[data-lettera-id="${cssEscape(node.id)}"]`,
    declarations: decls.join(';'),
  });
}

function buildHeadStyles(_theme: ThemeTokens, rules: ResponsiveRule[]): string {
  // Strong mobile-first defaults so any document is usable on phones without
  // the author having to author per-block overrides:
  //   - Single-column stacking under 600px
  //   - Images become fluid
  //   - Headings shrink one step
  //   - Buttons go full-width
  //   - Outer padding reduced
  const base = `
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table { border-collapse:collapse !important; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; max-width:100%; height:auto; }
    a { text-decoration:underline; }
    @media screen and (max-width:600px) {
      .lettera-section-inner { width:100% !important; max-width:100% !important; }
      .lettera-col {
        display:block !important;
        width:100% !important;
        max-width:100% !important;
      }
      .lettera-section-inner > tbody > tr > td { padding:16px !important; }
      img { width:100% !important; height:auto !important; }
      h1 { font-size:24px !important; line-height:1.25 !important; }
      h2 { font-size:20px !important; line-height:1.3 !important; }
      h3 { font-size:18px !important; line-height:1.3 !important; }
      a[data-lettera-btn] { display:block !important; width:100% !important; box-sizing:border-box !important; text-align:center !important; }
      ${rules.map((r) => `${r.selector} { ${r.declarations} }`).join('\n      ')}
    }
  `;
  return base.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function paddingCss(ctx: RenderContext, styles: StyleDelta | undefined): string | undefined {
  const p = styles?.padding;
  if (!p) return undefined;
  const t = ctx.resolve<number>(p.top) ?? 0;
  const r = ctx.resolve<number>(p.right) ?? 0;
  const b = ctx.resolve<number>(p.bottom) ?? 0;
  const l = ctx.resolve<number>(p.left) ?? 0;
  return `${t}px ${r}px ${b}px ${l}px`;
}

function extractPlainText(doc: EmailDocument): string {
  const lines: string[] = [];
  if (doc.metadata.preheader) lines.push(doc.metadata.preheader, '');
  for (const section of doc.root) {
    for (const row of section.children) {
      for (const col of row.children) {
        for (const block of col.children) {
          const line = blockToText(block);
          if (line) lines.push(line);
        }
      }
      lines.push('');
    }
  }
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function blockToText(block: Block): string {
  switch (block.type) {
    case 'block.heading':
    case 'block.text':
      return htmlToText(block.props.html);
    case 'block.button':
      return `${block.props.label} → ${block.props.href}`;
    case 'block.image':
      return block.props.alt ? `[Image: ${block.props.alt}]` : '';
    case 'block.divider':
      return '---';
    case 'block.spacer':
      return '';
    case 'block.html':
      return htmlToText(block.props.html);
    case 'block.repeater':
      // Plain-text view shows the body once. The renderer expands per-item
      // when actual data is bound; without data we just preview the template.
      return block.children.map(blockToText).filter(Boolean).join('\n');
    case 'block.conditional':
      return block.children.map(blockToText).filter(Boolean).join('\n');
  }
}

export { cssEscape, escapeHtml, htmlToText } from './html.js';
export { BlockRegistry } from './registry.js';

// ---------------------------------------------------------------------------
// Variable substitution
// ---------------------------------------------------------------------------

/**
 * Replaces every `<span data-lettera-var="path">…</span>` occurrence with
 * either the resolved sample value (preview mode) or the host's merge tag
 * syntax (export mode). Also handles plain `{{path}}` tokens that may have
 * been typed directly into raw HTML blocks — only in export mode are they
 * left alone; in preview they're substituted.
 *
 * The path may include formatter pipes — `customer.fee | currency:EUR`. In
 * preview mode the pipe is applied; in export mode it's preserved as part of
 * the merge tag so the host's send-time engine can apply it (or left to the
 * host's own pipe parser).
 */
function substituteVariables(
  input: string,
  ctx: RenderContext,
  scope?: Readonly<Record<string, unknown>>,
  schemaScope?: Readonly<Record<string, VariableSchemaNode>>,
): string {
  const VAR_SPAN_RE = /<span\b[^>]*\bdata-lettera-var="([^"]+)"[^>]*>[\s\S]*?<\/span>/g;
  let out = input.replace(VAR_SPAN_RE, (_m, rawPath: string) =>
    renderTag(decodeAttr(rawPath), ctx, scope, schemaScope),
  );
  if (ctx.mode === 'preview') {
    // Best-effort: replace bare {{path}} tokens with sample values for the canvas.
    out = out.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, expr: string) => {
      const piece = expr.trim();
      if (!/^[\w.[\]"'|: \t-]+$/.test(piece)) return `{{${piece}}}`;
      return renderTag(piece, ctx, scope, schemaScope);
    });
  }
  return out;
}

/**
 * Parse a `path | formatter:arg | other` expression and resolve it against
 * the render context. Returns an HTML-escaped string in preview mode and a
 * merge tag in export mode. The optional `scope` shadows the root data
 * context for the first path segment — used inside repeater iterations so
 * `{{service.name}}` resolves to the current item. `schemaScope` does the
 * same for type lookup, enabling kind-driven formatting (currency, date)
 * inside loops.
 */
function renderTag(
  spec: string,
  ctx: RenderContext,
  scope?: Readonly<Record<string, unknown>>,
  schemaScope?: Readonly<Record<string, VariableSchemaNode>>,
): string {
  const segments = spec.split('|').map((s) => s.trim());
  const path = segments[0] ?? '';
  const pipes = segments.slice(1);
  if (!path) return '';

  // Inside a repeater scope we always substitute, even in export mode — the
  // host's send-time engine doesn't know about our loop variables.
  const resolveLive = ctx.mode === 'preview' || (scope !== undefined && hasScopedRoot(path, scope));
  if (!resolveLive) {
    // Export passes the bare path through the host's merge-tag formatter.
    // Pipe specs are dropped because most ESPs don't understand them.
    return ctx.formatMergeTag(path);
  }

  // Resolve typed value + apply pipes / schema-driven formatting.
  const data = ctx.data ?? {};
  let value: unknown = resolveValuePath(data, path, scope);
  const node = resolveScopedSchema(ctx.schema, path, schemaScope);

  if (value == null && node && node.kind !== 'object' && node.kind !== 'list') {
    value = node.sample;
  }

  // Apply explicit formatter pipes first; they take precedence over schema
  // kind because the author asked for them by name.
  if (pipes.length > 0) {
    const formatters =
      (ctx as RenderContext & { __formatters?: FormatterRegistry }).__formatters ??
      defaultFormatters;
    for (const p of pipes) {
      const { name, args } = parseFormatterSpec(p);
      value = formatters.apply(value, name, args);
    }
    return ctx.escape(String(value ?? ''));
  }

  // No explicit pipe — let the schema kind drive automatic formatting.
  if (node && node.kind !== 'object' && node.kind !== 'list') {
    return ctx.escape(formatScalar(value, node, defaultFormatters));
  }

  // Fallback: legacy flat lookup.
  if (value == null) return ctx.escape(ctx.resolveVariable(path));
  return ctx.escape(String(value));
}

/**
 * Resolve a path's schema node, preferring the scoped alias map (so a
 * repeater item's schema is consulted before falling through to the global
 * schema).
 */
function resolveScopedSchema(
  schema: VariableSchema | undefined,
  path: string,
  schemaScope: Readonly<Record<string, VariableSchemaNode>> | undefined,
): VariableSchemaNode | undefined {
  if (schemaScope) {
    const dot = path.indexOf('.');
    const bracket = path.indexOf('[');
    const end = dot < 0 ? bracket : bracket < 0 ? dot : Math.min(dot, bracket);
    const head = end < 0 ? path : path.slice(0, end);
    const root = schemaScope[head];
    if (root) {
      // Walk the rest of the path through this scoped node.
      const rest = end < 0 ? '' : path.slice(end + (path[end] === '.' ? 1 : 0));
      if (!rest) return root;
      // Build a synthetic mini-schema so we can reuse resolveSchemaPath.
      return resolveSchemaPath({ fields: { [head]: root } }, path);
    }
  }
  return schema ? resolveSchemaPath(schema, path) : undefined;
}

function hasScopedRoot(path: string, scope: Readonly<Record<string, unknown>>): boolean {
  const dot = path.indexOf('.');
  const bracket = path.indexOf('[');
  const end = dot < 0 ? bracket : bracket < 0 ? dot : Math.min(dot, bracket);
  const head = end < 0 ? path : path.slice(0, end);
  return Object.hasOwn(scope, head);
}

/**
 * Render a scalar value as a string using its schema kind. Falls back to the
 * schema's `fallback` text when the value is null/undefined; returns `''` if
 * neither is available.
 */
function formatScalar(
  value: unknown,
  node: VariableSchemaNode | undefined,
  formatters: FormatterRegistry,
): string {
  if (!node || node.kind === 'object' || node.kind === 'list') {
    return value == null ? '' : String(value);
  }
  if (value == null) return node.fallback ?? '';
  switch (node.kind) {
    case 'currency':
      return formatters.apply(value, 'currency', [node.currency ?? 'EUR']);
    case 'date':
      return formatters.apply(value, 'date', ['short']);
    case 'datetime':
      return formatters.apply(value, 'datetime', ['short']);
    case 'number':
      return formatters.apply(value, 'number', []);
    default:
      return String(value);
  }
}

/**
 * Decode HTML attribute entities (specifically `&amp;` → `&`) so a path like
 * `a | currency:EUR` survives the editor's HTML serialisation, where the `|`
 * stays literal but ampersands inside formatter args (e.g. URL formatters)
 * would otherwise be doubled.
 */
function decodeAttr(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
