# Getting started

This guide takes you from zero to a working Lettera editor inside your
existing React application. Target audience: a CRM / SaaS engineer who
already has an authenticated API and wants to let users build email
templates.

## 1. Install

```bash
pnpm add @lettera/email-builder react react-dom @tanstack/react-query
```

With npm: `npm install @lettera/email-builder react react-dom`. With
yarn: `yarn add @lettera/email-builder react react-dom`.

`@tanstack/react-query` is optional — the examples use it for clarity,
but the editor works with any data-fetching approach.

> **ESM-only.** Lettera ships ES modules exclusively. Use a modern
> bundler (Vite, Webpack 5+, esbuild, Next.js, Remix). `require()` is
> not supported.

## 2. Render the editor

The quickest way to get a valid initial document is `createEmptyDocument()`:

```tsx
'use client';
import { LetteraEditor, createEmptyDocument } from '@lettera/email-builder';
import '@lettera/editor/styles.css'; // required — the editor has no inline styles

const EMPTY_DOCUMENT = createEmptyDocument('My Email');

export function EmptyEditor() {
  return (
    <div style={{ height: '100vh' }}>
      <LetteraEditor document={EMPTY_DOCUMENT} />
    </div>
  );
}
```

`createEmptyDocument(name)` returns a fully-valid `EmailDocument` with
the default theme tokens, content width, and one empty section. Use it
whenever your backend needs to seed a brand-new template.

The stylesheet import is required — without it the editor renders with
no layout. Always import it once at the entry point of the page that
hosts the editor.

This is already a functional editor — drag blocks from the palette, edit
properties in the inspector, preview mobile, use undo/redo. Nothing is
saved yet.

> **SSR note.** The editor imports browser-only libraries (Tiptap,
> dnd-kit). In Next.js App Router load it with `next/dynamic`:
>
> ```tsx
> const LetteraEditor = dynamic(
>   () => import('@lettera/email-builder').then((m) => m.LetteraEditor),
>   { ssr: false },
> );
> ```

## 3. Add autosave

The `onSave` prop wires the editor to your backend. The editor debounces
document mutations (default 1500 ms — i.e. 1.5 seconds) and calls your
callback with the latest document and a `SaveContext` whose `signal`
aborts when a newer save supersedes the current one — so your `fetch`
can cancel.

```tsx
<LetteraEditor
  document={template.content}
  autosaveDelay={1500} // milliseconds; default is 1500 (= 1.5 s)
  onSave={async (doc, { signal }) => {
    await fetch(`/api/templates/${template.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: doc }),
      headers: { 'Content-Type': 'application/json' },
      signal,
    });
  }}
  onSaveError={(err) => toast.error(err.message)}
/>
```

That is the entire autosave implementation. The editor handles
debouncing, in-flight coalescing, `beforeunload` flush, and abort on
unmount.

> **Always provide `onSaveError` in production.** Without it, save
> failures are silently swallowed by the autosave loop and your users
> have no way to know their edits aren't reaching the server.

## 4. Render to email HTML on the server

Templates are stored as JSON. To actually send an email, render the
document to HTML with the standard block registry:

```ts
// server side — no React required
import {
  render,
  BlockRegistry,
  standardBlocks,
} from '@lettera/email-builder/server';

const registry = new BlockRegistry();
registry.registerAll(standardBlocks);

export async function sendTemplate(doc, recipient) {
  const { html, text } = render(doc, {
    registry,
    schema: myVariableSchema,
    data: recipient,
    mode: 'export',
  });
  await mailer.send({ to: recipient.email, html, text });
}
```

The renderer produces inlined, email-safe table HTML plus a plain-text
fallback derived from the same AST.

## 5. Add version history (optional)

Use the `useVersions` hook alongside `usePersistence` for snapshot /
restore:

```tsx
import { usePersistence, useVersions } from '@lettera/email-builder';

function VersionsPanel({ templateId }) {
  const persistence = usePersistence({ onSave });
  const versions = useVersions({
    onListVersions: () => api(`/templates/${templateId}/versions`),
    onSnapshot: async (doc, label) => {
      await persistence.flush();
      return api(`/templates/${templateId}/versions`, {
        method: 'POST',
        body: JSON.stringify({ label, content: doc }),
      });
    },
    onRestore: async (vid) => {
      persistence.cancel();
      const restored = await api(`/templates/${templateId}/versions/${vid}/restore`, { method: 'POST' });
      return restored.content;
    },
  });
  return (/* ... your version list UI ... */);
}
```

Render this inside the editor via the `versionsPanel` prop so the hooks
share the editor's store.

## 6. Next steps

- [Integration guide](integration.md) — auth, multi-tenant, SSR, previews
- [Variables & merge tags](variables.md) — bind customer data into templates
- [Custom blocks](custom-blocks.md) — register your own domain-specific blocks
