/**
 * Variables (a.k.a. merge tags) supplied by the host system.
 *
 * The editor and renderer treat variables as opaque inline atoms. They survive
 * round-trips through the document as
 *
 *   <span data-lettera-var="user.firstName"></span>
 *
 * inside any rich-text HTML field. At render time a `mergeTagFormatter`
 * replaces them with the host's syntax (default: `{{path}}`). In `preview`
 * mode they're swapped for `sampleValue` so the editor canvas shows realistic
 * content.
 *
 * Variables are *not* stored in the document — they're an injection from the
 * host system, identical for every email rendered against that host.
 */

export type VariableType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'currency'
  | 'url'
  | 'email';

export interface VariableDefinition {
  /** Stable dotted path used as the wire format ("user.firstName"). */
  path: string;
  /** Human label for the picker UI. */
  label: string;
  /** Used in editor preview when no explicit override is supplied. */
  sampleValue?: string;
  /** Coarse type hint for validators / future formatters. */
  type?: VariableType;
  /** Optional grouping for the picker UI ("User", "Order"). */
  group?: string;
  /** Optional fallback inserted by `formatMergeTag` when host syntax supports it. */
  defaultValue?: string;
  /** Free-form description shown as tooltip. */
  description?: string;
}

export type MergeTagFormatter = (args: {
  path: string;
  variable: VariableDefinition | undefined;
}) => string;

/** Default formatter — Handlebars/SendGrid style `{{path}}`. */
export const defaultMergeTagFormatter: MergeTagFormatter = ({ path }) => `{{${path}}}`;

/** Mailchimp-style `*|TAG|*` formatter. Path is upper-cased and dots become underscores. */
export const mailchimpMergeTagFormatter: MergeTagFormatter = ({ path }) =>
  `*|${path.replace(/\./g, '_').toUpperCase()}|*`;

/** Look up a variable by path. */
export function findVariable(
  vars: readonly VariableDefinition[] | undefined,
  path: string,
): VariableDefinition | undefined {
  return vars?.find((v) => v.path === path);
}
