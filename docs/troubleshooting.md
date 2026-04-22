# Troubleshooting

Common issues integrators hit. Search this file before opening an issue.

## `401 Unauthorized` after login

**Cause.** Web origin and API origin disagree on hostname (e.g. web on
`localhost:3000` but `NEXT_PUBLIC_API_URL` points to `127.0.0.1:4000`).
Browsers treat these as different sites; the `sameSite=lax` session
cookie is not sent on cross-site fetches.

**Fix.**

- Use the same hostname for web and API in `apps/web/.env.local`.
- Verify `WEB_ORIGIN` in the API `.env` includes the web origin.
- In DevTools → Application → Cookies, confirm `lettera_session`
  exists for the **same** hostname the browser is on.

## `CORS` errors

**Cause.** `WEB_ORIGIN` on the API doesn't include the actual origin
the browser is using, or the request includes credentials but CORS is
configured without `Access-Control-Allow-Credentials`.

**Fix.** `WEB_ORIGIN` is comma-separated. Include every host:port the
browser may use, including production. The API plugin
[apps/api/src/server.ts](../apps/api/src/server.ts) registers
`@fastify/cors` with `credentials: true` automatically.

## Editor renders blank canvas

**Cause.** The `document` prop doesn't match the `EmailDocument` Zod
schema. The store load throws and the canvas stays empty.

**Fix.**

- Use `createEmptyDocument(name)` from `@lettera/email-builder` for
  new docs.
- For existing docs, validate against the schema:
  `EmailDocumentSchema.safeParse(doc)` and inspect errors.
- Check the browser console for the parse error.

## `Could not load libquery_engine` (Prisma in Docker)

**Cause.** Prisma's query engine binary is target-specific. On Apple
Silicon / Windows ARM64 a host-built engine leaks into the Linux
container.

**Fix.** `docker-compose.yml` already pins `apps/api` to
`platform: linux/amd64` and uses a named volume for `node_modules`.
If you customised the compose file, keep both behaviours.

## Save fires constantly while typing

**Cause.** `onDocumentChange` is firing — that callback is **not
debounced**. `onSave` is, but if you mistakenly persist from
`onDocumentChange` you'll save on every keystroke.

**Fix.** Use `onSave` for persistence. Use `onDocumentChange` only
for cheap, synchronous side-effects (analytics, dirty flag).

## Hydration mismatch in Next.js App Router

**Cause.** The editor uses browser-only libraries (Tiptap, dnd-kit).
Trying to render it in a server component triggers a hydration mismatch.

**Fix.** Wrap with `next/dynamic({ ssr: false })` — see
[integration.md](integration.md#nextjs-app-router).

## `Cannot find module '@lettera/email-builder'` after `pnpm install`

**Cause.** Workspaces aren't built. The meta-package re-exports the
internal packages from their `dist/` folders.

**Fix.** Run `pnpm build` once. `pnpm dev` then watches and rebuilds
on changes.

## Custom block doesn't appear in the palette

**Cause.** You registered the block with the renderer but not the
editor's singleton registry.

**Fix.**

```ts
import { setRegistry, BlockRegistry } from '@lettera/email-builder';
import { standardBlocks } from '@lettera/blocks-standard';

const registry = new BlockRegistry();
registry.registerAll(standardBlocks);
registry.register(MyBlock);
setRegistry(registry);   // do this BEFORE first <LetteraEditor> render
```

## Autosave silently fails

**Cause.** `onSave` rejected and you didn't pass `onSaveError`.
The hook swallows rejections so the loop continues.

**Fix.** Always wire `onSaveError` in production:

```tsx
<LetteraEditor onSave={save} onSaveError={(err) => toast.error(err.message)} />
```

## Versions panel shows `Cannot read properties of null`

**Cause.** `versionsPanel` was injected but the component inside it
calls `usePersistence` / `useVersions` from a position **above** the
editor's store provider in the React tree.

**Fix.** Render the versions component **inside** the `versionsPanel`
prop, not in a sibling tree. The editor wraps the slot in its store
context.
