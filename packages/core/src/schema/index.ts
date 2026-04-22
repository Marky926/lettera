/**
 * Document schema.
 *
 * The document is a tree:
 *
 *   Document → Section[] → Row[] → Column[] → Block[]
 *
 * Every node carries a stable `id` (nanoid), a discriminated `type`, and
 * optional editor metadata (`name`, `locked`, `hidden`). Style properties are
 * always either literals or token references.
 *
 * The schema here intentionally keeps `props` permissive per block type: each
 * block in `@lettera/blocks-standard` (or a plugin) owns its detailed Zod
 * shape and validates on top.
 */
import { z } from 'zod';
import { ThemeTokens, tokenOr } from '../tokens/index.js';

export const SCHEMA_VERSION = 1;

/** Default content-column width in px. Single source of truth. */
export const DEFAULT_CONTENT_WIDTH = 600;

// ---------------------------------------------------------------------------
// Shared style primitives
// ---------------------------------------------------------------------------

export const Spacing = z.object({
  top: tokenOr(z.number()).optional(),
  right: tokenOr(z.number()).optional(),
  bottom: tokenOr(z.number()).optional(),
  left: tokenOr(z.number()).optional(),
});
export type Spacing = z.infer<typeof Spacing>;

export const Background = z.object({
  color: tokenOr(z.string()).optional(),
  imageUrl: z.string().url().optional(),
  /** Solid fallback for clients that strip background images. */
  fallbackColor: z.string().optional(),
});
export type Background = z.infer<typeof Background>;

export const Border = z.object({
  width: z.number().nonnegative().optional(),
  style: z.enum(['solid', 'dashed', 'dotted']).default('solid').optional(),
  color: tokenOr(z.string()).optional(),
  radius: tokenOr(z.number()).optional(),
});
export type Border = z.infer<typeof Border>;

/** Style delta usable on any node; properties are intentionally generic. */
export const StyleDelta = z
  .object({
    background: Background.optional(),
    padding: Spacing.optional(),
    margin: Spacing.optional(),
    border: Border.optional(),
    color: tokenOr(z.string()).optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
    /** Free-form per-block style hints; renderers ignore unknown keys. */
    extra: z.record(z.unknown()).optional(),
  })
  .partial();
export type StyleDelta = z.infer<typeof StyleDelta>;

export const ResponsiveOverrides = z
  .object({
    mobile: z
      .object({
        styles: StyleDelta.optional(),
        hidden: z.boolean().optional(),
      })
      .optional(),
  })
  .optional();
export type ResponsiveOverrides = z.infer<typeof ResponsiveOverrides>;

// ---------------------------------------------------------------------------
// Node base
// ---------------------------------------------------------------------------

const NodeMetadata = {
  id: z.string().min(1),
  name: z.string().optional(),
  locked: z.boolean().optional(),
  hidden: z
    .object({
      desktop: z.boolean().optional(),
      mobile: z.boolean().optional(),
    })
    .optional(),
  styles: StyleDelta.optional(),
  responsive: ResponsiveOverrides,
} as const;

// ---------------------------------------------------------------------------
// Block schemas
// ---------------------------------------------------------------------------

export const HeadingProps = z.object({
  level: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  /** Inline HTML (sanitized at render time). */
  html: z.string(),
  /** Semantic style key (e.g. 'h1', 'h2', 'lead'). */
  styleRef: z.string().default('h1'),
  /** Optional inline overrides — when set, take precedence over the preset. */
  fontSize: z.number().positive().optional(),
  lineHeight: z.number().positive().optional(),
  letterSpacing: z.number().optional(),
  textTransform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).optional(),
});

export const TextProps = z.object({
  /** Inline HTML (sanitized at render time). */
  html: z.string(),
  styleRef: z.string().default('body'),
  /** Optional inline overrides — when set, take precedence over the preset. */
  fontSize: z.number().positive().optional(),
  lineHeight: z.number().positive().optional(),
  letterSpacing: z.number().optional(),
  textTransform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).optional(),
});

export const ButtonProps = z.object({
  label: z.string(),
  href: z.string().url().or(z.string().startsWith('mailto:')).or(z.string().startsWith('tel:')),
  /** Visual preset name; renderer maps to a default style if styles absent. */
  preset: z.enum(['primary', 'secondary', 'ghost']).default('primary'),
  fullWidth: z.boolean().default(false),
  /** Optional typography overrides for the button label. */
  fontSize: z.number().positive().optional(),
  lineHeight: z.number().positive().optional(),
  letterSpacing: z.number().optional(),
  textTransform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
});

export const ImageProps = z.object({
  src: z.string().url(),
  alt: z.string().default(''),
  width: z.number().positive().optional(),
  href: z.string().optional(),
});

export const SpacerProps = z.object({
  // Bounded to avoid a hand-crafted document shipping an absurd value that
  // breaks Outlook / hangs preview rendering. 2000px is far above any real
  // marketing-email use case.
  height: z.number().positive().max(2000).default(16),
});

export const DividerProps = z.object({
  thickness: z.number().positive().max(20).default(1),
  color: tokenOr(z.string()).optional(),
});

export const HtmlProps = z.object({
  /** Raw HTML, passed through verbatim. Linter will warn. */
  html: z.string(),
});

// ---------------------------------------------------------------------------
// Dynamic block props
// ---------------------------------------------------------------------------

/**
 * Repeater — instantiates its `children` once per item in `source` (a list path
 * on the typed schema). Inside the body, the loop variable named by `as`
 * shadows the root context, so authors write `{{service.name}}` rather than
 * `{{services[0].name}}`.
 */
export const RepeaterProps = z.object({
  /** Dotted path to a list field on the schema (e.g. `services`). */
  source: z.string(),
  /** Alias used inside the body to address the current item. */
  as: z.string().min(1).default('item'),
  /** Text shown when the source list is empty / missing. */
  emptyText: z.string().optional(),
});
export type RepeaterProps = z.infer<typeof RepeaterProps>;

/**
 * Conditional — renders `children` only when `when` evaluates truthy. The
 * `else` branch is optional; both branches share the parent's data scope.
 */
export const ConditionalProps = z.object({
  /** Boolean expression in the mini-expression language. */
  when: z.string(),
});
export type ConditionalProps = z.infer<typeof ConditionalProps>;

// ---------------------------------------------------------------------------
// Block discriminated union
// ---------------------------------------------------------------------------

/**
 * Block is *almost* recursive (only repeater + conditional contain other
 * blocks). To keep the discriminated union usable in TS — discriminated
 * unions don't compose well with `z.lazy` — we declare an explicit TS type
 * up-front and use `z.ZodType<Block>` to break the recursion at the schema
 * level. Children of dynamic blocks are typed as `unknown[]` in the zod
 * schema and re-validated through `Block` at the call sites that need it
 * (renderer + commands).
 */
type LeafBlockMeta = {
  id: string;
  name?: string;
  locked?: boolean;
  hidden?: { desktop?: boolean; mobile?: boolean };
  styles?: StyleDelta;
  responsive?: ResponsiveOverrides;
};
export type LeafBlock =
  | (LeafBlockMeta & { type: 'block.heading'; props: z.infer<typeof HeadingProps> })
  | (LeafBlockMeta & { type: 'block.text'; props: z.infer<typeof TextProps> })
  | (LeafBlockMeta & { type: 'block.button'; props: z.infer<typeof ButtonProps> })
  | (LeafBlockMeta & { type: 'block.image'; props: z.infer<typeof ImageProps> })
  | (LeafBlockMeta & { type: 'block.spacer'; props: z.infer<typeof SpacerProps> })
  | (LeafBlockMeta & { type: 'block.divider'; props: z.infer<typeof DividerProps> })
  | (LeafBlockMeta & { type: 'block.html'; props: z.infer<typeof HtmlProps> });

export type RepeaterBlock = LeafBlockMeta & {
  type: 'block.repeater';
  props: RepeaterProps;
  children: Block[];
};
export type ConditionalBlock = LeafBlockMeta & {
  type: 'block.conditional';
  props: ConditionalProps;
  children: Block[];
  else?: Block[];
};

export type Block = LeafBlock | RepeaterBlock | ConditionalBlock;
export type BlockType = Block['type'];

const LeafBlockSchema = z.discriminatedUnion('type', [
  z.object({ ...NodeMetadata, type: z.literal('block.heading'), props: HeadingProps }),
  z.object({ ...NodeMetadata, type: z.literal('block.text'), props: TextProps }),
  z.object({ ...NodeMetadata, type: z.literal('block.button'), props: ButtonProps }),
  z.object({ ...NodeMetadata, type: z.literal('block.image'), props: ImageProps }),
  z.object({ ...NodeMetadata, type: z.literal('block.spacer'), props: SpacerProps }),
  z.object({ ...NodeMetadata, type: z.literal('block.divider'), props: DividerProps }),
  z.object({ ...NodeMetadata, type: z.literal('block.html'), props: HtmlProps }),
]);

export const Block: z.ZodType<Block> = z.lazy(() =>
  z.union([
    LeafBlockSchema,
    z.object({
      ...NodeMetadata,
      type: z.literal('block.repeater'),
      props: RepeaterProps,
      children: z.array(Block).default([]),
    }),
    z.object({
      ...NodeMetadata,
      type: z.literal('block.conditional'),
      props: ConditionalProps,
      children: z.array(Block).default([]),
      else: z.array(Block).optional(),
    }),
  ]),
) as unknown as z.ZodType<Block>;

// ---------------------------------------------------------------------------
// Structural nodes
// ---------------------------------------------------------------------------

export const ColumnWidth = z.union([
  z.literal('1/1'),
  z.literal('1/2'),
  z.literal('1/3'),
  z.literal('2/3'),
  z.literal('1/4'),
  z.literal('3/4'),
]);
export type ColumnWidth = z.infer<typeof ColumnWidth>;

export const Column = z.object({
  ...NodeMetadata,
  type: z.literal('column'),
  props: z.object({
    width: ColumnWidth.default('1/1'),
    verticalAlign: z.enum(['top', 'middle', 'bottom']).default('top'),
  }),
  children: z.array(Block).default([]),
});
export type Column = z.infer<typeof Column>;

export const Row = z.object({
  ...NodeMetadata,
  type: z.literal('row'),
  props: z
    .object({
      /** Reverse stacking order on mobile. */
      stackReverse: z.boolean().default(false),
    })
    .default({ stackReverse: false }),
  children: z.array(Column).default([]),
});
export type Row = z.infer<typeof Row>;

export const Section = z.object({
  ...NodeMetadata,
  type: z.literal('section'),
  props: z
    .object({
      contentWidth: z.number().positive().default(DEFAULT_CONTENT_WIDTH),
      fullWidthBackground: z.boolean().default(false),
    })
    .default({ contentWidth: DEFAULT_CONTENT_WIDTH, fullWidthBackground: false }),
  children: z.array(Row).default([]),
});
export type Section = z.infer<typeof Section>;

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export const DocumentMetadata = z.object({
  name: z.string().default('Untitled'),
  subject: z.string().optional(),
  preheader: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type DocumentMetadata = z.infer<typeof DocumentMetadata>;

// ---------------------------------------------------------------------------
// Document-level body settings (page chrome around the content)
// ---------------------------------------------------------------------------

/**
 * Global "email body" settings — colour of the page background outside the
 * content column, default content width inherited by sections, default text /
 * link colours, and a base font override. All fields are optional; the
 * renderer falls back to the theme when a value is absent.
 */
export const BodySettings = z
  .object({
    /** Default content column width in px. Sections may override. */
    contentWidth: z.number().positive().default(DEFAULT_CONTENT_WIDTH),
    /** Page background (outside the content card). */
    canvasBackground: Background.optional(),
    /** Default content card background — applied when a section has none. */
    contentBackground: Background.optional(),
    /** Default text colour for the document. */
    textColor: tokenOr(z.string()).optional(),
    /** Default link colour. */
    linkColor: tokenOr(z.string()).optional(),
    /** Override the base body font (CSS font-family string, e.g. 'Inter, sans-serif'). */
    fontFamily: z.string().optional(),
    /** Default outer padding around the content column. */
    padding: Spacing.optional(),
  })
  .default({ contentWidth: DEFAULT_CONTENT_WIDTH });
export type BodySettings = z.infer<typeof BodySettings>;

export const EmailDocument = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(SCHEMA_VERSION),
  metadata: DocumentMetadata,
  theme: ThemeTokens,
  /** Document-level body / page settings. */
  body: BodySettings,
  root: z.array(Section),
  /** Reusable component definitions (V1.5+); empty for MVP. */
  components: z.array(z.unknown()).default([]),
});
export type EmailDocument = z.infer<typeof EmailDocument>;

export type AnyNode = EmailDocument | Section | Row | Column | Block;

/** Type guards (cheap, used in renderer + editor selection logic). */
export const isSection = (n: { type: string }): n is Section => n.type === 'section';
export const isRow = (n: { type: string }): n is Row => n.type === 'row';
export const isColumn = (n: { type: string }): n is Column => n.type === 'column';
export const isBlock = (n: { type: string }): n is Block => n.type.startsWith('block.');
