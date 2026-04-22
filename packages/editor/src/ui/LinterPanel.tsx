/**
 * Linter panel.
 *
 * Subscribes to `state.warnings` (refreshed by the canvas after every render)
 * and lists each item. Click → select the offending node.
 */
import { useEditorStore } from '../store/editorStore.js';

const SEVERITY_LABEL: Record<string, string> = {
  info: 'Info',
  warn: 'Warning',
  error: 'Error',
};

export function LinterPanel() {
  const warnings = useEditorStore((s) => s.warnings);
  const select = useEditorStore((s) => s.select);
  const dispatch = useEditorStore((s) => s.dispatch);

  return (
    <div className="lettera-editor__linter" role="region" aria-label="Linter">
      <header>
        <strong>Linter</strong>
        <span className="lettera-editor__linter-count">{warnings.length}</span>
      </header>
      {warnings.length === 0 ? (
        <p className="lettera-editor__linter-empty">No issues. Looks shippable.</p>
      ) : (
        <ul>
          {warnings.map((w, i) => (
            <li key={`${w.code}-${w.nodeId ?? 'doc'}-${i}`} data-severity={w.severity}>
              <button
                type="button"
                className="lettera-editor__linter-row"
                onClick={() => {
                  if (w.nodeId) select({ id: w.nodeId, type: 'block' });
                }}
                title={w.docsUrl ?? w.code}
              >
                <span className={`lettera-editor__linter-sev sev-${w.severity}`}>
                  {SEVERITY_LABEL[w.severity] ?? w.severity}
                </span>
                <span className="lettera-editor__linter-msg">{w.message}</span>
                <span className="lettera-editor__linter-code">{w.code}</span>
              </button>
              {w.quickFixes && w.quickFixes.length > 0 && (
                <div className="lettera-editor__linter-fixes">
                  {w.quickFixes.map((fix, j) => (
                    <button
                      key={`${fix.commandType}-${j}`}
                      type="button"
                      className="lettera-editor__btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch(fix.commandType, fix.payload);
                      }}
                    >
                      {fix.label}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
