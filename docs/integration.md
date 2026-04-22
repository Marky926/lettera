# Integration guide

Deeper reference for embedding Lettera in a production application:
authentication, persistence, versions, previews, multi-tenant, SSR.

## Architecture at a glance

```
┌──────────────────────────────────────────────┐
│ Your app                                     │
│   ┌────────────────────────────────────┐     │
│   │ <LetteraEditor>                    │     │
│   │   ├─ store (Zustand + Immer)       │     │
│   │   ├─ command bus (undo/redo)       │     │
│   │   ├─ Canvas (iframe + dnd-kit)     │     │
│   │   └─ Inspector / Palette / Layers  │     │
│   └────────────────────────────────────┘     │
│     │                                        │
│     ├── onSave ─────► your REST API          │
│     ├── useVersions ► your REST API          │
│     └── usePreview ──► @lettera/renderer     │
└──────────────────────────────────────────────┘
```

The editor owns the document in memory. You own the transport. Hooks
are the glue.

## Persistence (`onSave` / `usePersistence`)

Two equivalent APIs:

```tsx
// A. Declarative — pass the callback as a prop.
<LetteraEditor onSave={async (doc, { signal }) => { ... }} />

// B. Imperative — call the hook yourself for finer control.
function Inner() {
  const { flush, cancel, isSaving } = usePersistence({ onSave });
  ...
}
```

Pick (A) for the common case. Pick (B) when you need to:

- call `flush()` before navigating away,
- call `cancel()` when restoring a version,
- show a spinner keyed off `isSaving`.

### Guarantees

- **Debounced.** Default 1500 ms, configurable via `autosaveDelay`.
- **One in-flight save at a time.** Subsequent edits coalesce into a
  single trailing request.
- **Abortable.** A newer save aborts the previous one (via
  `AbortController`) so the host's `fetch` can cancel.
- **Unmount-safe.** No `setState` after unmount; any in-flight request
  is aborted.
- **Flush on tab close.** `beforeunload` triggers a final save (browsers
  no longer block on the promise, but the request is started). Disable
  with `flushOnUnload: false` if your persistence layer is async-only.
  This is best-effort — for critical writes prefer `navigator.sendBeacon`
  or a server-side draft channel.
- **No redundant sends.** Reference-equal documents are not re-sent.

> **Always provide `onSaveError`.** Without it, save failures are
> silently swallowed so the autosave loop can keep trying. In production
> hook this up to a toast and your error reporter.

## Versions (`useVersions`)

```tsx
const persistence = usePersistence({ onSave });
const versions = useVersions({
  onListVersions: () => api(`/templates/${id}/versions`),
  onSnapshot: async (doc, label) => {
    await persistence.flush();          // snapshot reflects on-screen state
    return api(`/templates/${id}/versions`, {
      method: 'POST',
      body: JSON.stringify({ label, content: doc }),
    });
  },
  onRestore: async (vid) => {
    persistence.cancel();                // don't overwrite restored content
    const r = await api(`/templates/${id}/versions/${vid}/restore`, { method: 'POST' });
    return r.content;
  },
  onError: (err, op) => console.error(op, err),
});

versions.versions;          // VersionEntry[]
versions.createSnapshot(label);
versions.restore(versionId);
versions.refresh();
```

The hook maintains the version list in local state, refetches after
writes, and pushes restored content into the editor store via
`loadDocument` (which resets undo history — a restore is an atomic jump).

## Preview (`usePreview`)

For "Send a test email" modals where you want to render a specific
payload without disturbing the editor:

```tsx
const preview = usePreview({
  data: realCustomerPayload,
  schema: workspaceSchema,
  device: 'mobile',
});
if (preview) {
  return <iframe srcDoc={preview.html} />;
}
```

The editor's canvas is unaffected — `usePreview` is pure.

## Authentication

Lettera has no opinion on auth. Your `onSave` / `onListVersions` etc.
are plain callbacks — call whatever authenticated fetch wrapper you
already have:

```ts
async function api(path, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include', // session cookies
    headers: { 'Content-Type': 'application/json', ...init.headers },
    ...init,
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}
```

## Multi-tenant / workspaces

Render one `<LetteraEditor>` per loaded template. Remount on template
change to reset the internal store:

```tsx
<LetteraEditor
  key={`${workspaceId}:${templateId}`}
  document={template.content}
  variables={workspace.variables}
  schema={workspace.variableSchema}
  data={previewData}
  onSave={makeSaveFn(workspaceId, templateId)}
/>
```

The `key` prop forces React to unmount and remount the editor, which
resets its internal Zustand store, undo history, and selection. Without
a changing `key`, switching templates would inherit the previous
template's undo stack and stale selection IDs — hard to spot bugs.

The `variables` / `schema` / `data` props flow through to the inspector,
the Variables panel, and the preview renderer.

> **Changing `document` without changing `key`.** Updating the
> `document` prop in place does *not* remount the editor; it dispatches
> `loadDocument()` internally to reconcile the store while preserving
> undo history. Use a `key` only when you want a hard reset.

## Server-side rendering

Render documents to HTML from your API without pulling React. The
`/server` entrypoint is Node-safe (works in serverless functions,
workers, edge runtimes — anywhere modern ESM runs):

```ts
import {
  render,
  BlockRegistry,
  standardBlocks,
  type EmailDocument,
  type VariableContext,
  type VariableSchema,
} from '@lettera/email-builder/server';

const registry = new BlockRegistry();
registry.registerAll(standardBlocks);

export function renderEmail(
  doc: EmailDocument,
  data: VariableContext,    // runtime values for the recipient
  schema: VariableSchema,   // typed variable schema
) {
  return render(doc, {
    registry,
    schema,
    data,
    mode: 'export',     // emit merge tags for ESP-side substitution
    // mode: 'preview',  // substitute sample values for in-app preview
  });
}
```

`render()` returns `{ html, text, warnings }`. The `warnings` list
surfaces lint issues (unresolved variables, missing alt text, etc.) so
your API can reject invalid templates before queuing them to an ESP.

## Framework integration

### Next.js (App Router)

```tsx
// app/templates/[id]/page.tsx
'use client';
import dynamic from 'next/dynamic';
import '@lettera/editor/styles.css';

const LetteraEditor = dynamic(
  () => import('@lettera/email-builder').then((m) => m.LetteraEditor),
  { ssr: false, loading: () => <div>Loading editor…</div> },
);

export default function Page({ params }) { /* ... */ }
```

### Vite / CRA

No special handling — just import `LetteraEditor` and the stylesheet.

### Remix / Astro

Wrap the editor in a client-only island. Same pattern as Next — avoid
SSR because of Tiptap / dnd-kit.

## Bundle size

The meta-package is designed for tree-shaking via subpath exports. A
node worker that only renders emails imports
`@lettera/email-builder/server` and ships no React code. A preview modal
that only needs the renderer imports `@lettera/email-builder/hooks`
(React hooks only — no Tiptap).
