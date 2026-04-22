/**
 * Inspector - schema-driven property editor with three layers:
 *
 *   1. **Block inspector**: tabs from the block's `BlockDefinition.inspector`
 *      schema, plus an auto-generated **Style** tab (background, text colour,
 *      padding, border, alignment) and an **Advanced** tab (rename, duplicate,
 *      delete) common to every block.
 *   2. **Structural inspectors**: section / row / column have purpose-built
 *      forms (content width, column width, vertical alignment, etc.).
 *   3. **Document inspector**: when nothing is selected, edit document-level
 *      body settings (page background, content background, default text /
 *      link colour, content width, base font, padding).
 *
 * For blocks, structural nodes, and the document, edits dispatch through the
 * command bus so undo/redo and coalescing still work.
 *
 * When the editor's device toggle is on `mobile`, style edits go to the
 * node's `responsive.mobile.styles` instead of `styles` via
 * `doc/updateStyles`'s `scope: 'mobile'`.
 */

import {
  type Block,
  type BodySettings,
  type Column,
  type ColumnWidth,
  findNode,
  type Row,
  type Section,
  type StyleDelta,
  type VariableDefinition,
} from '@lettera/core';
import type { InspectorControl } from '@lettera/sdk';
import { Fragment, type ReactNode, useMemo, useState } from 'react';
import { getRegistry } from '../registry.js';
import { type Selection, useEditorStore } from '../store/editorStore.js';
import { COLUMN_WIDTHS_ALL, getByPath, propsPatchFor } from '../util/path.js';
import { RichTextEditor } from './RichTextEditor.js';
import { colFlex, ROW_PRESETS } from './usePaletteActions.js';

type StyleScope = 'base' | 'mobile';

/** Read styles for a node based on the active style scope (base / mobile). */
function getStylesForScope(
  node: { styles?: StyleDelta; responsive?: { mobile?: { styles?: StyleDelta } } },
  scope: StyleScope,
): StyleDelta | undefined {
  return scope === 'mobile' ? node.responsive?.mobile?.styles : node.styles;
}

// ---------------------------------------------------------------------------
// Inspector entry
// ---------------------------------------------------------------------------

export function Inspector() {
  const selection = useEditorStore((s) => s.selection);
  const doc = useEditorStore((s) => s.doc);
  const dispatch = useEditorStore((s) => s.dispatch);
  const select = useEditorStore((s) => s.select);
  const variables = useEditorStore((s) => s.variables);
  const device = useEditorStore((s) => s.device);

  const found = useMemo(() => {
    if (!selection) return null;
    return findNode(doc, selection.id) ?? null;
  }, [selection, doc]);

  const node = found?.node ?? null;
  const styleScope: StyleScope = device === 'mobile' ? 'mobile' : 'base';

  return (
    <div className="lettera-editor__panel lettera-editor__inspector">
      {!node ? (
        <DocumentInspector
          body={doc.body ?? { contentWidth: 600 }}
          onPatch={(body) => dispatch('doc/updateBody', { body })}
        />
      ) : selection?.type === 'block' ? (
        <BlockInspector
          key={(node as Block).id}
          block={node as Block}
          variables={variables}
          styleScope={styleScope}
          onPropsPatch={(patch) =>
            dispatch('doc/updateProps', { id: (node as Block).id, props: patch })
          }
          onStylePatch={(patch) =>
            dispatch('doc/updateStyles', {
              id: (node as Block).id,
              styles: patch,
              scope: styleScope,
            })
          }
          onRename={(name) => dispatch('doc/rename', { id: (node as Block).id, name })}
          onDelete={() => {
            dispatch('doc/remove', { id: (node as Block).id });
            select(null);
          }}
          onDuplicate={() => dispatch('doc/duplicate', { id: (node as Block).id })}
        />
      ) : selection?.type === 'section' ? (
        <SectionInspector
          section={node as Section}
          docBody={doc.body ?? { contentWidth: 600 }}
          styleScope={styleScope}
          onPropsPatch={(props) => dispatch('doc/updateProps', { id: (node as Section).id, props })}
          onStylePatch={(styles) =>
            dispatch('doc/updateStyles', {
              id: (node as Section).id,
              styles,
              scope: styleScope,
            })
          }
          onInsertRow={(columns) =>
            dispatch('doc/insertRow', { sectionId: (node as Section).id, columns })
          }
          onDelete={() => {
            dispatch('doc/remove', { id: (node as Section).id });
            select(null);
          }}
        />
      ) : selection?.type === 'row' ? (
        <RowInspector
          row={node as Row}
          styleScope={styleScope}
          onPropsPatch={(props) => dispatch('doc/updateProps', { id: (node as Row).id, props })}
          onStylePatch={(styles) =>
            dispatch('doc/updateStyles', {
              id: (node as Row).id,
              styles,
              scope: styleScope,
            })
          }
          onAddColumn={(width) => dispatch('doc/insertColumn', { rowId: (node as Row).id, width })}
          onDelete={() => {
            dispatch('doc/remove', { id: (node as Row).id });
            select(null);
          }}
        />
      ) : selection?.type === 'column' ? (
        <ColumnInspector
          column={node as Column}
          styleScope={styleScope}
          onPropsPatch={(props) => dispatch('doc/updateProps', { id: (node as Column).id, props })}
          onStylePatch={(styles) =>
            dispatch('doc/updateStyles', {
              id: (node as Column).id,
              styles,
              scope: styleScope,
            })
          }
          onDelete={() => {
            dispatch('doc/remove', { id: (node as Column).id });
            select(null);
          }}
        />
      ) : (
        <div className="empty">Select an element to edit it.</div>
      )}

      {device === 'mobile' && node && (
        <div className="lettera-mobile-banner" role="note">
          Editing mobile overrides - these styles apply only on screens up to 600px.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Document body inspector
// ---------------------------------------------------------------------------

function DocumentInspector({
  body,
  onPatch,
}: {
  body: BodySettings;
  onPatch(b: Partial<BodySettings>): void;
}) {
  return (
    <>
      <h2>Email body</h2>
      <div className="field">
        <label>Content width (px)</label>
        <input
          type="number"
          min={320}
          max={1000}
          step={10}
          value={Number(body.contentWidth ?? 600)}
          onChange={(e) => onPatch({ contentWidth: Number(e.target.value) || 600 })}
        />
      </div>
      <div className="field">
        <label>Page background</label>
        <ColorInput
          value={body.canvasBackground?.color}
          onChange={(v) => onPatch({ canvasBackground: { color: v as string | undefined } })}
        />
      </div>
      <div className="field">
        <label>Content background</label>
        <ColorInput
          value={body.contentBackground?.color}
          onChange={(v) => onPatch({ contentBackground: { color: v as string | undefined } })}
        />
      </div>
      <div className="field">
        <label>Text colour</label>
        <ColorInput
          value={body.textColor}
          onChange={(v) => onPatch({ textColor: v as string | undefined })}
        />
      </div>
      <div className="field">
        <label>Link colour</label>
        <ColorInput
          value={body.linkColor}
          onChange={(v) => onPatch({ linkColor: v as string | undefined })}
        />
      </div>
      <div className="field">
        <label>Body font (CSS family)</label>
        <input
          type="text"
          placeholder="Inter, Arial, sans-serif"
          value={body.fontFamily ?? ''}
          onChange={(e) => onPatch({ fontFamily: e.target.value || undefined })}
        />
      </div>
      <div className="field">
        <label>Outer padding (px)</label>
        <SpacingGrid value={body.padding} onChange={(p) => onPatch({ padding: p })} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Block inspector with tabs (Content + Style + Advanced)
// ---------------------------------------------------------------------------

function BlockInspector({
  block,
  variables,
  styleScope,
  onPropsPatch,
  onStylePatch,
  onRename,
  onDelete,
  onDuplicate,
}: {
  block: Block;
  variables: readonly VariableDefinition[];
  styleScope: StyleScope;
  onPropsPatch(patch: Record<string, unknown>): void;
  onStylePatch(patch: StyleDelta): void;
  onRename(name: string): void;
  onDelete(): void;
  onDuplicate(): void;
}) {
  const def = getRegistry().get(block.type);
  const schemaTabs = def?.inspector?.tabs ?? [];
  const tabs = useMemo(
    () => [
      ...schemaTabs.map((t) => ({ id: t.id, label: t.label })),
      { id: '__style', label: 'Style' },
      { id: '__advanced', label: 'Advanced' },
    ],
    [schemaTabs],
  );
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? '__style');

  const liveStyles = getStylesForScope(block, styleScope);

  return (
    <>
      <h2>{def?.name ?? block.type}</h2>
      <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />
      {schemaTabs.map(
        (tab) =>
          tab.id === activeTab && (
            <Fragment key={tab.id}>
              {tab.groups.map((g) => (
                <div key={g.id}>
                  <div className="group-title">{g.label}</div>
                  {g.controls.map((c, i) => {
                    if (c.kind === 'group') return null;
                    const value = getByPath(block, c.path);
                    return (
                      <Field
                        key={`${c.path}-${i}`}
                        control={c}
                        value={value}
                        variables={variables}
                        onChange={(next) => {
                          const patch = propsPatchFor(
                            block.props as Record<string, unknown>,
                            c.path,
                            next,
                          );
                          onPropsPatch(patch);
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </Fragment>
          ),
      )}
      {activeTab === '__style' && (
        <div>
          <div className="group-title">{styleScope === 'mobile' ? 'Mobile style' : 'Style'}</div>
          <StyleGroup styles={liveStyles} onPatch={onStylePatch} rich />
        </div>
      )}
      {activeTab === '__advanced' && (
        <AdvancedTab
          name={block.name ?? ''}
          onRename={onRename}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
        />
      )}
    </>
  );
}

function AdvancedTab({
  name,
  onRename,
  onDelete,
  onDuplicate,
}: {
  name: string;
  onRename(n: string): void;
  onDelete(): void;
  onDuplicate(): void;
}) {
  return (
    <>
      <div className="field">
        <label>Layer name</label>
        <input
          type="text"
          value={name}
          placeholder="Optional name shown in Layers"
          onChange={(e) => onRename(e.target.value)}
        />
      </div>
      <div className="lettera-inspector-actions">
        <button type="button" className="lettera-editor__btn" onClick={onDuplicate}>
          Duplicate
        </button>
        <button
          type="button"
          className="lettera-editor__btn lettera-editor__btn--danger"
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Section inspector
// ---------------------------------------------------------------------------

function SectionInspector({
  section,
  docBody,
  styleScope,
  onPropsPatch,
  onStylePatch,
  onInsertRow,
  onDelete,
}: {
  section: Section;
  docBody: BodySettings;
  styleScope: StyleScope;
  onPropsPatch(p: Record<string, unknown>): void;
  onStylePatch(s: StyleDelta): void;
  onInsertRow(columns: ColumnWidth[]): void;
  onDelete(): void;
}) {
  const liveStyles = getStylesForScope(section, styleScope);
  const isEmpty = section.children.length === 0;
  return (
    <>
      <h2>Section</h2>
      {isEmpty ? (
        <div className="lettera-inspector-empty-hint">
          <p style={{ margin: '0 0 8px', color: '#374151', fontSize: 13 }}>
            This section is empty. Pick a row layout to get started:
          </p>
          <div
            className="lettera-row-presets"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}
          >
            {ROW_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="lettera-right-panel__tile lettera-right-panel__tile--clickable"
                onClick={() => onInsertRow(p.columns)}
                title={p.label}
              >
                <span className="lettera-row-glyph" aria-hidden>
                  {p.columns.map((w, i) => (
                    <span
                      key={i}
                      className="lettera-row-glyph__cell"
                      style={{ flex: colFlex(w) }}
                    />
                  ))}
                </span>
                <span className="lettera-right-panel__tile-label">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="field">
        <label>Content width (px)</label>
        <input
          type="number"
          min={320}
          max={1000}
          step={10}
          value={Number(section.props.contentWidth ?? docBody.contentWidth ?? 600)}
          onChange={(e) => onPropsPatch({ contentWidth: Number(e.target.value) || 600 })}
        />
      </div>
      <div className="field lettera-checkbox-field">
        <input
          id="sec-fwbg"
          type="checkbox"
          checked={Boolean(section.props.fullWidthBackground)}
          onChange={(e) => onPropsPatch({ fullWidthBackground: e.target.checked })}
        />
        <label htmlFor="sec-fwbg">Full-width background</label>
      </div>
      <div className="group-title">{styleScope === 'mobile' ? 'Mobile style' : 'Style'}</div>
      <StyleGroup styles={liveStyles} onPatch={onStylePatch} rich={false} />
      <div className="lettera-inspector-actions">
        <button
          type="button"
          className="lettera-editor__btn lettera-editor__btn--danger"
          onClick={onDelete}
        >
          Delete section
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Row inspector
// ---------------------------------------------------------------------------

function RowInspector({
  row,
  styleScope,
  onPropsPatch,
  onStylePatch,
  onAddColumn,
  onDelete,
}: {
  row: Row;
  styleScope: StyleScope;
  onPropsPatch(p: Record<string, unknown>): void;
  onStylePatch(s: StyleDelta): void;
  onAddColumn(width: ColumnWidth): void;
  onDelete(): void;
}) {
  const liveStyles = getStylesForScope(row, styleScope);
  return (
    <>
      <h2>Row</h2>
      <div className="field lettera-checkbox-field">
        <input
          id="row-stack"
          type="checkbox"
          checked={Boolean(row.props.stackReverse)}
          onChange={(e) => onPropsPatch({ stackReverse: e.target.checked })}
        />
        <label htmlFor="row-stack">Reverse column order on mobile</label>
      </div>
      <div className="group-title">Columns ({row.children.length})</div>
      <div className="lettera-inspector-actions" style={{ flexWrap: 'wrap' }}>
        {(['1/1', '1/2', '1/3', '1/4'] as ColumnWidth[]).map((w) => (
          <button
            key={w}
            type="button"
            className="lettera-editor__btn"
            onClick={() => onAddColumn(w)}
          >
            + {w}
          </button>
        ))}
      </div>
      <div className="group-title">{styleScope === 'mobile' ? 'Mobile style' : 'Style'}</div>
      <StyleGroup styles={liveStyles} onPatch={onStylePatch} rich={false} />
      <div className="lettera-inspector-actions">
        <button
          type="button"
          className="lettera-editor__btn lettera-editor__btn--danger"
          onClick={onDelete}
        >
          Delete row
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Column inspector
// ---------------------------------------------------------------------------

function ColumnInspector({
  column,
  styleScope,
  onPropsPatch,
  onStylePatch,
  onDelete,
}: {
  column: Column;
  styleScope: StyleScope;
  onPropsPatch(p: Record<string, unknown>): void;
  onStylePatch(s: StyleDelta): void;
  onDelete(): void;
}) {
  const liveStyles = getStylesForScope(column, styleScope);
  return (
    <>
      <h2>Column</h2>
      <div className="field">
        <label>Width</label>
        <select
          value={column.props.width}
          onChange={(e) => onPropsPatch({ width: e.target.value as ColumnWidth })}
        >
          {COLUMN_WIDTHS_ALL.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Vertical alignment</label>
        <select
          value={column.props.verticalAlign}
          onChange={(e) => onPropsPatch({ verticalAlign: e.target.value })}
        >
          <option value="top">Top</option>
          <option value="middle">Middle</option>
          <option value="bottom">Bottom</option>
        </select>
      </div>
      <div className="group-title">{styleScope === 'mobile' ? 'Mobile style' : 'Style'}</div>
      <StyleGroup styles={liveStyles} onPatch={onStylePatch} rich={false} />
      <div className="lettera-inspector-actions">
        <button
          type="button"
          className="lettera-editor__btn lettera-editor__btn--danger"
          onClick={onDelete}
        >
          Delete column
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Style group (background, text, padding, align, border)
// ---------------------------------------------------------------------------

interface StyleGroupProps {
  styles: StyleDelta | undefined;
  onPatch(patch: StyleDelta): void;
  rich?: boolean;
}

function StyleGroup({ styles, onPatch, rich = true }: StyleGroupProps) {
  const bg = styles?.background?.color;
  const text = styles?.color;
  const align = styles?.align;
  const border = styles?.border ?? {};
  const radius = border.radius;
  return (
    <>
      <div className="field">
        <label>Background</label>
        <ColorInput
          value={bg}
          onChange={(v) => onPatch({ background: { color: v as string | undefined } })}
        />
      </div>
      <div className="field">
        <label>Text colour</label>
        <ColorInput value={text} onChange={(v) => onPatch({ color: v as string | undefined })} />
      </div>
      <div className="field">
        <label>Padding (px)</label>
        <SpacingGrid value={styles?.padding} onChange={(p) => onPatch({ padding: p })} />
      </div>
      {rich && (
        <>
          <div className="field">
            <label>Alignment</label>
            <div className="lettera-segmented">
              {(['left', 'center', 'right'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={align === a}
                  onClick={() => onPatch({ align: align === a ? undefined : a })}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Border width (px)</label>
            <input
              type="number"
              min={0}
              value={Number(border.width ?? 0)}
              onChange={(e) =>
                onPatch({
                  border: {
                    ...border,
                    width: e.target.value === '' ? undefined : Number(e.target.value),
                  },
                })
              }
            />
          </div>
          <div className="field">
            <label>Border colour</label>
            <ColorInput
              value={border.color}
              onChange={(v) => onPatch({ border: { ...border, color: v as string | undefined } })}
            />
          </div>
          <div className="field">
            <label>Border radius (px)</label>
            <input
              type="number"
              min={0}
              value={Number(radius ?? 0)}
              onChange={(e) =>
                onPatch({
                  border: {
                    ...border,
                    radius: e.target.value === '' ? undefined : Number(e.target.value),
                  },
                })
              }
            />
          </div>
        </>
      )}
    </>
  );
}

function SpacingGrid({
  value,
  onChange,
}: {
  value:
    | {
        top?: number | { $token: string };
        right?: number | { $token: string };
        bottom?: number | { $token: string };
        left?: number | { $token: string };
      }
    | undefined;
  onChange(next: { top?: number; right?: number; bottom?: number; left?: number }): void;
}) {
  const v = value ?? {};
  const num = (k: 'top' | 'right' | 'bottom' | 'left') => {
    const x = (v as Record<string, unknown>)[k];
    return typeof x === 'number' ? x : 0;
  };
  return (
    <div className="lettera-spacing-grid">
      {(['top', 'right', 'bottom', 'left'] as const).map((s) => (
        <input
          key={s}
          type="number"
          min={0}
          placeholder={s[0]!.toUpperCase()}
          title={s}
          value={num(s)}
          onChange={(e) =>
            onChange({
              ...(v as { top?: number; right?: number; bottom?: number; left?: number }),
              [s]: e.target.value === '' ? undefined : Number(e.target.value),
            })
          }
        />
      ))}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: unknown; onChange: (next: unknown) => void }) {
  const cur = typeof value === 'string' ? value : '';
  return (
    <div className="lettera-color-input">
      <input type="color" value={cur || '#000000'} onChange={(e) => onChange(e.target.value)} />
      <input
        type="text"
        placeholder="none"
        value={cur}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
      {cur && (
        <button
          type="button"
          className="lettera-editor__btn"
          title="Clear"
          onClick={() => onChange(undefined)}
        >
          ×
        </button>
      )}
    </div>
  );
}

interface TabBarProps {
  tabs: ReadonlyArray<{ id: string; label: string }>;
  active: string;
  onChange(id: string): void;
}
function TabBar({ tabs, active, onChange }: TabBarProps) {
  if (tabs.length <= 1) return null;
  return (
    <div className="lettera-editor__tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === active}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

interface FieldProps {
  control: InspectorControl;
  value: unknown;
  onChange: (next: unknown) => void;
  variables: readonly VariableDefinition[];
}
function Field({ control, value, onChange, variables }: FieldProps) {
  if (control.kind === 'group') return null;
  const id = `f-${control.path}`;
  if (control.kind === 'text' && control.path.endsWith('.html')) {
    return (
      <div className="field">
        <label htmlFor={id}>{control.label}</label>
        <RichTextEditor
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          variables={variables}
          ariaLabel={control.label}
        />
      </div>
    );
  }
  return (
    <div className="field">
      <label htmlFor={id}>{control.label}</label>
      {renderInput(id, control, value, onChange)}
    </div>
  );
}

function renderInput(
  id: string,
  control: Exclude<InspectorControl, { kind: 'group' }>,
  value: unknown,
  onChange: (n: unknown) => void,
): ReactNode {
  switch (control.kind) {
    case 'text':
      return control.multiline ? (
        <textarea
          id={id}
          value={(value as string | undefined) ?? ''}
          placeholder={control.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={(value as string | undefined) ?? ''}
          placeholder={control.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'number': {
      const num = value as number | undefined;
      return (
        <input
          id={id}
          type="number"
          value={typeof num === 'number' ? num : ''}
          placeholder={control.placeholder ?? (control.nullable ? 'Auto' : undefined)}
          min={control.min}
          max={control.max}
          step={control.step ?? 1}
          onChange={(e) => {
            const raw = e.target.value;
            if (control.nullable && raw === '') {
              onChange(undefined);
              return;
            }
            onChange(Number(raw));
          }}
        />
      );
    }
    case 'boolean':
      return (
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case 'select': {
      const cur = value === undefined || value === null ? '' : String(value);
      return (
        <select
          id={id}
          value={cur}
          onChange={(e) => {
            const raw = e.target.value;
            if (control.nullable && raw === '') {
              onChange(undefined);
              return;
            }
            const num = Number(raw);
            onChange(Number.isFinite(num) && raw.trim() !== '' && String(num) === raw ? num : raw);
          }}
        >
          {control.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    case 'color':
      return <ColorInput value={value} onChange={onChange} />;
    case 'image':
      return (
        <input
          id={id}
          type="url"
          placeholder="https://..."
          value={(value as string | undefined) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return (
        <input
          id={id}
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

export type { Selection };
