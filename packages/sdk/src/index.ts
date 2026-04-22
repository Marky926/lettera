/**
 * @lettera/sdk
 *
 * Public, framework-agnostic plugin contracts.
 *
 * Plugins compose four primary kinds of contributions:
 *   - **Blocks**: editor + export renderers paired with a schema
 *   - **Export hooks**: pre/post transformations on the AST or HTML
 *   - **Validators**: linter rules
 *   - **Template sources**: where templates come from
 *
 * The SDK does not import React. The `editorRender` field on a block uses an
 * opaque component type that the editor package narrows when wiring blocks up.
 */

import type {
  Block,
  EmailDocument,
  ThemeTokens,
  VariableContext,
  VariableDefinition,
  VariableSchema,
} from '@lettera/core';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Render context (passed to exportRender)
// ---------------------------------------------------------------------------

export interface RenderContext {
  doc: EmailDocument;
  theme: ThemeTokens;
  device: 'desktop' | 'mobile';
  /** 'preview' substitutes sample values; 'export' emits merge tag syntax. */
  mode: 'preview' | 'export';
  /** Variables exposed by the host system (merge tags). */
  variables: readonly VariableDefinition[];
  /**
   * Optional typed variable schema (second-generation merge-tag model).
   * When present alongside `data`, the renderer prefers it over the legacy
   * flat `variables` list for path resolution + automatic formatting.
   */
  schema?: VariableSchema;
  /** Runtime data for typed-schema substitution (preview + export). */
  data?: VariableContext;
  /** Escape a string for safe insertion into HTML text content. */
  escape(value: string): string;
  /** Resolve a token ref or literal to its concrete value. */
  resolve<T>(value: T | { $token: string } | undefined): T | undefined;
  /** Format a merge tag for export (e.g. `{{user.firstName}}`). */
  formatMergeTag(path: string): string;
  /** Resolve a variable to its preview/sample value. Returns '' if unknown. */
  resolveVariable(path: string): string;
  /**
   * Evaluate a template expression (paths, comparisons, logical ops). Returns
   * `undefined` on parse error so callers can render gracefully. Only present
   * when the renderer was given a typed schema; legacy callers should fall
   * back to `resolveVariable`.
   */
  evaluate?(source: string, scope?: Readonly<Record<string, unknown>>): unknown;
  /** Append a warning that bubbles to the linter / compatibility report. */
  warn(
    message: string,
    opts?: { code?: string; nodeId?: string; quickFixes?: ReadonlyArray<LintQuickFix> },
  ): void;
}

export type ExportRenderFn<TBlock extends Block> = (args: {
  node: TBlock;
  ctx: RenderContext;
}) => string;

// ---------------------------------------------------------------------------
// Inspector control schema (declarative)
// ---------------------------------------------------------------------------

export type InspectorControl =
  | { kind: 'text'; path: string; label: string; placeholder?: string; multiline?: boolean }
  | { kind: 'number'; path: string; label: string; min?: number; max?: number; step?: number }
  | { kind: 'boolean'; path: string; label: string }
  | { kind: 'select'; path: string; label: string; options: { value: string; label: string }[] }
  | { kind: 'color'; path: string; label: string; allowToken?: boolean }
  | { kind: 'tokenPicker'; path: string; label: string; tokenType: 'color' | 'spacing' | 'radius' }
  | { kind: 'spacing'; path: string; label: string }
  | { kind: 'image'; path: string; label: string }
  | { kind: 'datetime'; path: string; label: string }
  | { kind: 'group'; label: string; controls: InspectorControl[] };

/**
 * Discriminator of {@link InspectorControl}. Handy when narrowing custom
 * control renderers or enumerating supported kinds in a switch:
 *
 * ```ts
 * function renderControl(c: InspectorControl) {
 *   const kind: InspectorControlKind = c.kind;
 *   switch (kind) { ... }
 * }
 * ```
 */
export type InspectorControlKind = InspectorControl['kind'];

export interface InspectorTab {
  id: string;
  label: string;
  groups: { id: string; label: string; controls: InspectorControl[] }[];
}

export interface InspectorSchema {
  tabs: InspectorTab[];
}

// ---------------------------------------------------------------------------
// Block definition
// ---------------------------------------------------------------------------

/**
 * Editor render component type.
 *
 * Kept as `unknown` here to avoid coupling the SDK to React. The editor
 * package narrows it to `React.ComponentType<EditorBlockProps<T>>` when it
 * registers blocks, via a typed cast in `defineEditorBlock`.
 */
export type EditorRender = unknown;

export interface BlockDefinition<TBlock extends Block = Block> {
  type: TBlock['type'];
  name: string;
  category: 'Layout' | 'Content' | 'Media' | 'Marketing' | 'Advanced' | (string & {});
  icon?: string;
  version: number;
  /** Zod schema validating `props`. Defaults applied here, not in the union. */
  propsSchema: z.ZodTypeAny;
  /** Initial props for newly inserted instances. */
  defaultProps: TBlock['props'];
  /** Editor preview component (typed in the editor layer). */
  editorRender?: EditorRender;
  /** Pure function emitting email-safe HTML for this block. */
  exportRender: ExportRenderFn<TBlock>;
  /** Declarative inspector schema. */
  inspector?: InspectorSchema;
}

// ---------------------------------------------------------------------------
// Validators (linter rules)
// ---------------------------------------------------------------------------

export type LintSeverity = 'info' | 'warn' | 'error';

export interface LintResult {
  code: string;
  severity: LintSeverity;
  message: string;
  nodeId?: string;
  /** Optional documentation link explaining the rule. */
  docsUrl?: string;
  /**
   * One or more suggested fixes. Each carries a command type + payload that
   * will be dispatched through the editor's command bus when the user clicks
   * the fix button. Keep these declarative so they round-trip through the
   * renderer (which has no access to a UI bus).
   */
  quickFixes?: ReadonlyArray<LintQuickFix>;
}

export interface LintQuickFix {
  /** Short button label, e.g. "Remove block" or "Add alt text". */
  label: string;
  /** Command type to dispatch (must be registered on the editor's bus). */
  commandType: string;
  /** Payload for the command. */
  payload: unknown;
}

export interface ValidatorDefinition {
  code: string;
  scope: 'document' | 'node';
  severity: LintSeverity;
  /** When `scope: 'node'`, restrict to certain types. */
  nodeTypes?: string[];
  check(args: {
    doc: EmailDocument;
    node?: Block | { type: string; id: string };
  }): LintResult[] | LintResult | null | undefined;
}

// ---------------------------------------------------------------------------
// Export hooks
// ---------------------------------------------------------------------------

export interface ExportHookDefinition {
  id: string;
  /** Lower runs first. */
  priority?: number;
  beforeRender?(args: { doc: EmailDocument; ctx: RenderContext }): EmailDocument | void;
  afterRender?(args: { html: string; doc: EmailDocument; ctx: RenderContext }): string | void;
}

// ---------------------------------------------------------------------------
// Template sources
// ---------------------------------------------------------------------------

export interface TemplateSummary {
  id: string;
  name: string;
  thumbnailUrl?: string;
  tags?: string[];
}

export interface TemplateSourceDefinition {
  id: string;
  list(): Promise<TemplateSummary[]>;
  get(id: string): Promise<EmailDocument>;
  save?(doc: EmailDocument, name: string): Promise<TemplateSummary>;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export interface PluginDefinition {
  name: string;
  version?: string;
  blocks?: BlockDefinition[];
  validators?: ValidatorDefinition[];
  exportHooks?: ExportHookDefinition[];
  templateSources?: TemplateSourceDefinition[];
}

export function defineBlock<TBlock extends Block>(
  def: BlockDefinition<TBlock>,
): BlockDefinition<TBlock> {
  return def;
}

export function definePlugin(def: PluginDefinition): PluginDefinition {
  return def;
}

export function defineValidator(def: ValidatorDefinition): ValidatorDefinition {
  return def;
}

export function defineExportHook(def: ExportHookDefinition): ExportHookDefinition {
  return def;
}

export { z };
