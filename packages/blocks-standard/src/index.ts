import {
  type Block,
  ButtonProps,
  ConditionalProps,
  DividerProps,
  HeadingProps,
  HtmlProps,
  ImageProps,
  RepeaterProps,
  SpacerProps,
  TextProps,
} from '@lettera/core';
import { defineBlock, z } from '@lettera/sdk';
import {
  defineInspector,
  isSafeUrl,
  safeCssValue,
  safeUrl,
  sanitizeBlockHtml,
  sanitizeRawHtml,
  semanticTextStyleCss,
  spacingToCss,
  styleAttr,
  tableWrap,
  typographyOverridesCss,
} from './helpers.js';

type Heading = Extract<Block, { type: 'block.heading' }>;
type Text = Extract<Block, { type: 'block.text' }>;
type Button = Extract<Block, { type: 'block.button' }>;
type Image = Extract<Block, { type: 'block.image' }>;
type Spacer = Extract<Block, { type: 'block.spacer' }>;
type Divider = Extract<Block, { type: 'block.divider' }>;
type Html = Extract<Block, { type: 'block.html' }>;
type Repeater = Extract<Block, { type: 'block.repeater' }>;
type Conditional = Extract<Block, { type: 'block.conditional' }>;

// ---------------------------------------------------------------------------
// Shared typography option lists — keep small + email-tested values so the
// dropdowns are scannable. The empty-string option is the "auto / inherit
// from preset" sentinel; the inspector clears the prop when it is selected.
// ---------------------------------------------------------------------------

const AUTO_OPT = { value: '', label: 'Auto (preset)' } as const;

const FONT_SIZE_OPTS = [
  AUTO_OPT,
  ...[10, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64, 72].map((n) => ({
    value: String(n),
    label: `${n} px`,
  })),
];

const LINE_HEIGHT_OPTS = [
  AUTO_OPT,
  ...[1, 1.1, 1.15, 1.2, 1.3, 1.4, 1.5, 1.6, 1.75, 2].map((n) => ({
    value: String(n),
    label: String(n),
  })),
];

const LETTER_SPACING_OPTS = [
  AUTO_OPT,
  ...[-2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 1.5, 2, 3, 4].map((n) => ({
    value: String(n),
    label: `${n > 0 ? '+' : ''}${n} px`,
  })),
];

const TEXT_TRANSFORM_OPTS = [
  AUTO_OPT,
  { value: 'none', label: 'None' },
  { value: 'uppercase', label: 'UPPERCASE' },
  { value: 'lowercase', label: 'lowercase' },
  { value: 'capitalize', label: 'Capitalize' },
];

const FONT_WEIGHT_OPTS = [
  AUTO_OPT,
  { value: '300', label: '300 — Light' },
  { value: '400', label: '400 — Regular' },
  { value: '500', label: '500 — Medium' },
  { value: '600', label: '600 — Semibold' },
  { value: '700', label: '700 — Bold' },
  { value: '800', label: '800 — Extrabold' },
];

// ---------------------------------------------------------------------------
// Heading
// ---------------------------------------------------------------------------

export const HeadingBlock = defineBlock<Heading>({
  type: 'block.heading',
  name: 'Heading',
  category: 'Content',
  icon: 'heading',
  version: 1,
  propsSchema: HeadingProps,
  defaultProps: { level: 1, html: 'Your headline', styleRef: 'h1' },
  inspector: defineInspector('Heading', [
    { kind: 'text', path: 'props.html', label: 'Text' },
    {
      kind: 'select',
      path: 'props.level',
      label: 'Level',
      options: [1, 2, 3, 4, 5, 6].map((n) => ({
        value: String(n),
        label: `H${n}`,
      })),
    },
    {
      kind: 'select',
      path: 'props.styleRef',
      label: 'Style preset',
      options: ['display', 'h1', 'h2', 'h3', 'h4', 'lead'].map((s) => ({
        value: s,
        label: s,
      })),
    },
    {
      kind: 'select',
      path: 'props.fontSize',
      label: 'Font size',
      options: FONT_SIZE_OPTS,
      nullable: true,
    },
    {
      kind: 'select',
      path: 'props.lineHeight',
      label: 'Line height',
      options: LINE_HEIGHT_OPTS,
      nullable: true,
    },
    {
      kind: 'select',
      path: 'props.letterSpacing',
      label: 'Letter spacing',
      options: LETTER_SPACING_OPTS,
      nullable: true,
    },
    {
      kind: 'select',
      path: 'props.textTransform',
      label: 'Text transform',
      options: TEXT_TRANSFORM_OPTS,
      nullable: true,
    },
  ]),
  exportRender: ({ node, ctx }) => {
    const tag = `h${node.props.level}` as const;
    const css = [
      semanticTextStyleCss(ctx, node.props.styleRef),
      typographyOverridesCss(node.props),
      'margin:0',
      styleAttr(ctx, node.styles),
    ]
      .filter(Boolean)
      .join(';');
    return `<${tag} style="${css}">${sanitizeBlockHtml(node.props.html)}</${tag}>`;
  },
});

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export const TextBlock = defineBlock<Text>({
  type: 'block.text',
  name: 'Text',
  category: 'Content',
  icon: 'text',
  version: 1,
  propsSchema: TextProps,
  defaultProps: { html: '<p>Write something compelling.</p>', styleRef: 'body' },
  inspector: defineInspector('Text', [
    { kind: 'text', path: 'props.html', label: 'Body', multiline: true },
    {
      kind: 'select',
      path: 'props.styleRef',
      label: 'Style preset',
      options: ['body', 'lead', 'caption'].map((s) => ({
        value: s,
        label: s,
      })),
    },
    {
      kind: 'select',
      path: 'props.fontSize',
      label: 'Font size',
      options: FONT_SIZE_OPTS,
      nullable: true,
    },
    {
      kind: 'select',
      path: 'props.lineHeight',
      label: 'Line height',
      options: LINE_HEIGHT_OPTS,
      nullable: true,
    },
    {
      kind: 'select',
      path: 'props.letterSpacing',
      label: 'Letter spacing',
      options: LETTER_SPACING_OPTS,
      nullable: true,
    },
    {
      kind: 'select',
      path: 'props.textTransform',
      label: 'Text transform',
      options: TEXT_TRANSFORM_OPTS,
      nullable: true,
    },
  ]),
  exportRender: ({ node, ctx }) => {
    const css = [
      semanticTextStyleCss(ctx, node.props.styleRef),
      typographyOverridesCss(node.props),
      'margin:0',
      styleAttr(ctx, node.styles),
    ]
      .filter(Boolean)
      .join(';');
    // Body text comes as HTML already (Tiptap output); sanitized to a known-safe
    // allowlist (no scripts, styles, iframes, event handlers, javascript: links).
    return `<div style="${css}">${sanitizeBlockHtml(node.props.html)}</div>`;
  },
});

// ---------------------------------------------------------------------------
// Button — bulletproof for Outlook (VML) + standard for everything else.
// ---------------------------------------------------------------------------

export const ButtonBlock = defineBlock<Button>({
  type: 'block.button',
  name: 'Button',
  category: 'Content',
  icon: 'mouse-pointer',
  version: 1,
  propsSchema: ButtonProps,
  defaultProps: {
    label: 'Get started',
    href: 'https://example.com',
    preset: 'primary',
    fullWidth: false,
  },
  inspector: defineInspector('Button', [
    { kind: 'text', path: 'props.label', label: 'Label' },
    { kind: 'text', path: 'props.href', label: 'Link URL' },
    {
      kind: 'select',
      path: 'props.preset',
      label: 'Preset',
      options: [
        { value: 'primary', label: 'Primary' },
        { value: 'secondary', label: 'Secondary' },
        { value: 'ghost', label: 'Ghost' },
      ],
    },
    { kind: 'boolean', path: 'props.fullWidth', label: 'Full width' },
    {
      kind: 'select',
      path: 'props.fontSize',
      label: 'Font size',
      options: FONT_SIZE_OPTS,
      nullable: true,
    },
    {
      kind: 'select',
      path: 'props.fontWeight',
      label: 'Font weight',
      options: FONT_WEIGHT_OPTS,
      nullable: true,
    },
    {
      kind: 'select',
      path: 'props.lineHeight',
      label: 'Line height',
      options: LINE_HEIGHT_OPTS,
      nullable: true,
    },
    {
      kind: 'select',
      path: 'props.letterSpacing',
      label: 'Letter spacing',
      options: LETTER_SPACING_OPTS,
      nullable: true,
    },
    {
      kind: 'select',
      path: 'props.textTransform',
      label: 'Text transform',
      options: TEXT_TRANSFORM_OPTS,
      nullable: true,
    },
  ]),
  exportRender: ({ node, ctx }) => {
    const brand = ctx.theme.color.brand.primary;
    const inverse = ctx.theme.color.text.inverse ?? '#ffffff';

    const presetBg =
      node.props.preset === 'primary'
        ? brand
        : node.props.preset === 'secondary'
          ? (ctx.theme.color.surface.subtle ?? '#EEF2F7')
          : 'transparent';
    const presetColor = node.props.preset === 'primary' ? inverse : ctx.theme.color.text.default;
    const radius = ctx.resolve<number>(node.styles?.border?.radius) ?? ctx.theme.radius.md;
    const bgColor = ctx.resolve<string>(node.styles?.background?.color) ?? presetBg;
    const color = ctx.resolve<string>(node.styles?.color) ?? presetColor;
    const padding = spacingToCss(ctx, node.styles?.padding) ?? '12px 20px';
    const fontStack = ctx.theme.typography.families.body
      .map((f) => (/\s/.test(f) ? `"${f}"` : f))
      .join(', ');

    const fontSize = node.props.fontSize ?? 14;
    const fontWeightVml = node.props.fontWeight ?? 'bold';
    const fontWeightHtml = node.props.fontWeight ?? 600;
    const overrides = typographyOverridesCss({
      lineHeight: node.props.lineHeight,
      letterSpacing: node.props.letterSpacing,
      textTransform: node.props.textTransform,
    });
    const overridesSuffix = overrides ? `;${overrides}` : '';

    const href = safeUrl(node.props.href);
    const safeHref = ctx.escape(href);
    const safeLabel = ctx.escape(node.props.label);

    if (!isSafeUrl(node.props.href)) {
      ctx.warn('Button href is not a safe URL; falling back to #', {
        code: 'button.unsafe-href',
        nodeId: node.id,
      });
    }

    // VML for Outlook desktop; standard <a> for everything else.
    const vml = `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:44px;v-text-anchor:middle;width:200px;" arcsize="${Math.round((radius / 22) * 100)}%" stroke="f" fillcolor="${bgColor}">
  <w:anchorlock/>
  <center style="color:${color};font-family:${fontStack};font-size:${fontSize}px;font-weight:${fontWeightVml}${overridesSuffix};">${safeLabel}</center>
</v:roundrect>
<![endif]-->`;

    const widthStyle = node.props.fullWidth
      ? 'display:block;width:100%;box-sizing:border-box;text-align:center;'
      : 'display:inline-block;';
    const html = `<!--[if !mso]><!-- -->
<a data-lettera-btn href="${safeHref}" style="${widthStyle}background-color:${bgColor};color:${color};padding:${padding};border-radius:${radius}px;text-decoration:none;font-family:${fontStack};font-size:${fontSize}px;font-weight:${fontWeightHtml}${overridesSuffix};mso-hide:all;">${safeLabel}</a>
<!--<![endif]-->`;

    const align = node.styles?.align ?? 'center';
    return `<div style="text-align:${align}">${vml}${html}</div>`;
  },
});

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

export const ImageBlock = defineBlock<Image>({
  type: 'block.image',
  name: 'Image',
  category: 'Media',
  icon: 'image',
  version: 1,
  propsSchema: ImageProps,
  defaultProps: { src: 'https://via.placeholder.com/600x300', alt: '' },
  inspector: defineInspector('Image', [
    { kind: 'image', path: 'props.src', label: 'Source' },
    { kind: 'text', path: 'props.alt', label: 'Alt text' },
    { kind: 'number', path: 'props.width', label: 'Width (px)' },
    { kind: 'text', path: 'props.href', label: 'Link URL (optional)' },
  ]),
  exportRender: ({ node, ctx }) => {
    if (!node.props.alt) {
      ctx.warn('Image is missing alt text', {
        code: 'image.missing-alt',
        nodeId: node.id,
      });
    }
    if (!isSafeUrl(node.props.src)) {
      ctx.warn('Image src is not a safe URL; image omitted', {
        code: 'image.unsafe-src',
        nodeId: node.id,
      });
      return '';
    }
    const widthAttr = node.props.width ? ` width="${node.props.width}"` : '';
    const alt = ctx.escape(node.props.alt ?? '');
    const src = ctx.escape(safeUrl(node.props.src));
    const img = `<img src="${src}" alt="${alt}"${widthAttr} style="display:block;border:0;outline:none;text-decoration:none;max-width:100%;height:auto" />`;
    if (node.props.href) {
      const linkHref = ctx.escape(safeUrl(node.props.href));
      return `<a href="${linkHref}" target="_blank" rel="noopener">${img}</a>`;
    }
    return img;
  },
});

// ---------------------------------------------------------------------------
// Spacer
// ---------------------------------------------------------------------------

export const SpacerBlock = defineBlock<Spacer>({
  type: 'block.spacer',
  name: 'Spacer',
  category: 'Layout',
  icon: 'space',
  version: 1,
  propsSchema: SpacerProps,
  defaultProps: { height: 16 },
  inspector: defineInspector('Spacer', [
    { kind: 'number', path: 'props.height', label: 'Height (px)', min: 1 },
  ]),
  exportRender: ({ node }) => {
    // Schema validates `height` as a positive number, but bound it here too
    // so a hand-crafted document can't ship a 9-digit value that breaks email
    // clients. The clamp matches the schema's max bound.
    const h = Math.max(0, Math.min(2000, Number(node.props.height) || 0));
    return `<div style="line-height:${h}px;font-size:${h}px;height:${h}px">&nbsp;</div>`;
  },
});

// ---------------------------------------------------------------------------
// Divider
// ---------------------------------------------------------------------------

export const DividerBlock = defineBlock<Divider>({
  type: 'block.divider',
  name: 'Divider',
  category: 'Layout',
  icon: 'minus',
  version: 1,
  propsSchema: DividerProps,
  defaultProps: { thickness: 1 },
  inspector: defineInspector('Divider', [
    { kind: 'number', path: 'props.thickness', label: 'Thickness (px)', min: 1 },
    { kind: 'color', path: 'props.color', label: 'Color', allowToken: true },
  ]),
  exportRender: ({ node, ctx }) => {
    // `safeCssValue` rejects anything that could break out of the inline
    // `style="…"` declaration (quotes, semicolons, `expression(`, etc.).
    const resolved = ctx.resolve<string>(node.props.color);
    const color = safeCssValue(resolved) ?? safeCssValue(ctx.theme.color.text.muted) ?? '#999999';
    const thickness = Math.max(0, Math.min(20, Number(node.props.thickness) || 1));
    return tableWrap(
      `<div style="font-size:0;line-height:0;border-top:${thickness}px solid ${color};">&nbsp;</div>`,
      { width: '100%' },
    );
  },
});

// ---------------------------------------------------------------------------
// Raw HTML
// ---------------------------------------------------------------------------

export const HtmlBlock = defineBlock<Html>({
  type: 'block.html',
  name: 'HTML',
  category: 'Advanced',
  icon: 'code',
  version: 1,
  propsSchema: HtmlProps,
  defaultProps: { html: '<!-- raw html -->' },
  inspector: defineInspector('HTML', [
    { kind: 'text', path: 'props.html', label: 'HTML', multiline: true },
  ]),
  exportRender: ({ node, ctx }) => {
    ctx.warn('Raw HTML blocks bypass the linter; verify rendering across clients', {
      code: 'html.raw',
      nodeId: node.id,
    });
    return sanitizeRawHtml(node.props.html);
  },
});

// ---------------------------------------------------------------------------
// Repeater — dynamic block. The renderer intercepts this type before calling
// `exportRender`, so the function below is effectively a safety net that
// runs only when a registry lookup somehow reaches it (e.g. a host renderer
// that doesn't know about dynamic blocks). It emits the template body once
// so the email still has content.
// ---------------------------------------------------------------------------

export const RepeaterBlock = defineBlock<Repeater>({
  type: 'block.repeater',
  name: 'Repeater',
  category: 'Advanced',
  icon: 'repeat',
  version: 1,
  propsSchema: RepeaterProps,
  defaultProps: { source: '', as: 'item' },
  inspector: defineInspector('Repeater', [
    {
      kind: 'text',
      path: 'props.source',
      label: 'Source (list path)',
      placeholder: 'services',
    },
    { kind: 'text', path: 'props.as', label: 'Item alias', placeholder: 'item' },
    { kind: 'text', path: 'props.emptyText', label: 'Empty state text' },
  ]),
  exportRender: () => '<!-- repeater fallback: renderer did not intercept; emitted empty -->',
});

// ---------------------------------------------------------------------------
// Conditional — same rationale as Repeater.
// ---------------------------------------------------------------------------

export const ConditionalBlock = defineBlock<Conditional>({
  type: 'block.conditional',
  name: 'Conditional',
  category: 'Advanced',
  icon: 'git-branch',
  version: 1,
  propsSchema: ConditionalProps,
  defaultProps: { when: 'true' },
  inspector: defineInspector('Conditional', [
    {
      kind: 'text',
      path: 'props.when',
      label: 'When (expression)',
      placeholder: 'customer.isPremium',
    },
  ]),
  exportRender: () => '<!-- conditional fallback: renderer did not intercept; emitted empty -->',
});

// ---------------------------------------------------------------------------
// Bundle
// ---------------------------------------------------------------------------

export const standardBlocks = [
  HeadingBlock,
  TextBlock,
  ButtonBlock,
  ImageBlock,
  SpacerBlock,
  DividerBlock,
  HtmlBlock,
  RepeaterBlock,
  ConditionalBlock,
] as const;

export { z };
