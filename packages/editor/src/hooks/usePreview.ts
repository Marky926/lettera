/**
 * usePreview — render the current store doc with arbitrary test data.
 *
 * The editor's canvas already renders the live doc into an iframe using
 * the schema-default sample values. `usePreview` is for the *secondary*
 * use case: a "Send a test email" or "Preview as customer" modal where
 * the integrator wants to feed a specific payload (e.g. a real CRM
 * contact) and inspect the resulting HTML / text / warnings without
 * disturbing the editor.
 *
 * The hook is read-only — it never dispatches into the command bus and
 * never touches `data` in the store. Re-runs `render()` whenever `doc`
 * (subscribed from the store), `data`, or `schema` changes.
 *
 * Example:
 *
 * ```tsx
 * const preview = usePreview({
 *   data: realCustomerPayload,
 *   schema: workspaceSchema,
 * });
 * if (preview) {
 *   return <iframe srcDoc={preview.html} />;
 * }
 * ```
 */

import type { EmailDocument, VariableContext, VariableSchema } from '@lettera/core';
/**
 * Defer the import to keep `@lettera/renderer` out of the editor's
 * required dependency closure for hosts that only use the editor and
 * render server-side. The renderer is, however, already an editor
 * dependency for the Canvas, so this is just an organisational seam.
 */
import { render } from '@lettera/renderer';
import type { LintResult } from '@lettera/sdk';
import { useMemo } from 'react';
import { getRegistry } from '../registry.js';
import { useEditorStore } from '../store/editorStore.js';

export interface UsePreviewOptions {
  /**
   * Runtime values keyed by the schema's top-level fields. Replaces the
   * sample values from the schema for this preview only.
   */
  data?: VariableContext;
  /** Override the editor's schema for this preview only. */
  schema?: VariableSchema;
  /** Render device. Defaults to `'desktop'`. */
  device?: 'desktop' | 'mobile';
  /**
   * 'preview' renders sample / supplied data; 'export' emits merge tags
   * (e.g. `{{contact.email}}`). Defaults to `'preview'`.
   */
  mode?: 'preview' | 'export';
}

export interface PreviewResult {
  html: string;
  text: string;
  warnings: readonly LintResult[];
}

export function usePreview(options: UsePreviewOptions = {}): PreviewResult | null {
  const doc = useEditorStore((s) => s.doc) as EmailDocument;
  const storeSchema = useEditorStore((s) => s.schema);
  const storeVariables = useEditorStore((s) => s.variables);

  const schema = options.schema ?? storeSchema;
  const data = options.data;
  const device = options.device ?? 'desktop';
  const mode = options.mode ?? 'preview';

  return useMemo<PreviewResult>(() => {
    const registry = getRegistry();
    const result = render(doc, {
      registry,
      device,
      variables: storeVariables,
      schema,
      data,
      mode,
    });
    return { html: result.html, text: result.text, warnings: result.warnings };
  }, [doc, schema, data, device, mode, storeVariables]);
}
