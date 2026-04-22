/**
 * Token model.
 *
 * Tokens are document-level design primitives (color, spacing, radius, shadow,
 * typography). Style values throughout the document can either be a literal
 * (e.g. `"#1F6FEB"` / `16`) or a *token reference* (`{ $token: 'color.brand.primary' }`).
 *
 * Renaming a token preserves references because resolution is by path string
 * stored in references, with id-based brand kits at a higher level (V1.5).
 */
import { z } from 'zod';

/** A reference to a token by dotted path, e.g. `color.brand.primary`. */
export const TokenRef = z.object({
  $token: z.string().min(1),
});
export type TokenRef = z.infer<typeof TokenRef>;

/** Generic helper: a value that is either a literal `T` or a token reference. */
export const tokenOr = <T extends z.ZodTypeAny>(literal: T) => z.union([literal, TokenRef]);

export const ColorTokens = z.object({
  brand: z.object({
    primary: z.string(),
    secondary: z.string().optional(),
  }),
  text: z.object({
    default: z.string(),
    muted: z.string(),
    inverse: z.string().optional(),
  }),
  surface: z.object({
    default: z.string(),
    subtle: z.string().optional(),
  }),
});
export type ColorTokens = z.infer<typeof ColorTokens>;

export const SpacingTokens = z.object({
  /** Ordered scale, e.g. [0,2,4,8,12,16,24,32,48,64]. Tokens reference index. */
  scale: z.array(z.number().nonnegative()),
});
export type SpacingTokens = z.infer<typeof SpacingTokens>;

export const RadiusTokens = z.object({
  none: z.number().default(0),
  sm: z.number(),
  md: z.number(),
  lg: z.number(),
  full: z.number().default(9999),
});
export type RadiusTokens = z.infer<typeof RadiusTokens>;

export const FontStack = z.array(z.string()).min(1);
export type FontStack = z.infer<typeof FontStack>;

export const SemanticTextStyle = z.object({
  family: z.enum(['heading', 'body', 'mono']).default('body'),
  size: z.number().positive(),
  weight: z.number().int().min(100).max(900).default(400),
  lineHeight: z.number().positive().default(1.5),
  letterSpacing: z.number().default(0),
  color: tokenOr(z.string()).optional(),
  textTransform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).optional(),
});
export type SemanticTextStyle = z.infer<typeof SemanticTextStyle>;

export const TypographyTokens = z.object({
  families: z.object({
    heading: FontStack,
    body: FontStack,
    mono: FontStack.optional(),
  }),
  semanticStyles: z.object({
    display: SemanticTextStyle.optional(),
    h1: SemanticTextStyle,
    h2: SemanticTextStyle,
    h3: SemanticTextStyle,
    h4: SemanticTextStyle.optional(),
    body: SemanticTextStyle,
    lead: SemanticTextStyle.optional(),
    caption: SemanticTextStyle.optional(),
    overline: SemanticTextStyle.optional(),
  }),
});
export type TypographyTokens = z.infer<typeof TypographyTokens>;

export const ThemeTokens = z.object({
  color: ColorTokens,
  spacing: SpacingTokens,
  radius: RadiusTokens,
  typography: TypographyTokens,
});
export type ThemeTokens = z.infer<typeof ThemeTokens>;

/**
 * Resolve a token reference against a token tree.
 * Returns `undefined` if the path is not found (caller decides fallback).
 */
export function resolveToken(tokens: ThemeTokens, path: string): unknown {
  const parts = path.split('.');
  let cursor: unknown = tokens;
  for (const part of parts) {
    if (cursor && typeof cursor === 'object' && part in (cursor as object)) {
      cursor = (cursor as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cursor;
}

/** Resolve a possibly-tokenized value to its literal. */
export function resolveValue<T>(
  tokens: ThemeTokens,
  value: T | TokenRef | undefined,
): T | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'object' && value !== null && '$token' in (value as object)) {
    return resolveToken(tokens, (value as TokenRef).$token) as T | undefined;
  }
  return value as T;
}

/** A sensible neutral default theme. Consumers can override piecewise. */
export const defaultTheme: ThemeTokens = {
  color: {
    brand: { primary: '#1F6FEB' },
    text: { default: '#0B1220', muted: '#5B6478', inverse: '#FFFFFF' },
    surface: { default: '#FFFFFF', subtle: '#F4F6FA' },
  },
  spacing: { scale: [0, 2, 4, 8, 12, 16, 24, 32, 48, 64] },
  radius: { none: 0, sm: 4, md: 8, lg: 16, full: 9999 },
  typography: {
    families: {
      heading: ['Inter', 'Helvetica', 'Arial', 'sans-serif'],
      body: ['Inter', 'Helvetica', 'Arial', 'sans-serif'],
    },
    semanticStyles: {
      h1: { family: 'heading', size: 32, weight: 700, lineHeight: 1.2, letterSpacing: -0.2 },
      h2: { family: 'heading', size: 24, weight: 700, lineHeight: 1.3, letterSpacing: -0.1 },
      h3: { family: 'heading', size: 20, weight: 600, lineHeight: 1.35, letterSpacing: 0 },
      body: { family: 'body', size: 16, weight: 400, lineHeight: 1.5, letterSpacing: 0 },
      lead: { family: 'body', size: 18, weight: 400, lineHeight: 1.55, letterSpacing: 0 },
      caption: {
        family: 'body',
        size: 12,
        weight: 400,
        lineHeight: 1.4,
        letterSpacing: 0,
        color: { $token: 'color.text.muted' },
      },
    },
  },
};
