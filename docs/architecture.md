# Architecture

A tour of how the pieces fit together. Read this before contributing
to the core packages.

## Layered design

```
                ┌──────────────────────────────────────────────┐
                │            Host application                  │
                │  (Next.js / Vite / Remix / your own shell)   │
                └────────────────────┬─────────────────────────┘
                                     │ React props
                ┌────────────────────▼─────────────────────────┐
                │            @lettera/email-builder            │  meta
                │       /editor   /server   /hooks barrels     │
                └────────────────────┬─────────────────────────┘
                                     │
       ┌─────────────────────────────┼──────────────────────────┐
       │                             │                          │
┌──────▼───────┐        ┌────────────▼──────────┐    ┌──────────▼─────────┐
│  @lettera/   │        │     @lettera/         │    │   @lettera/        │
│   editor     │        │      renderer         │    │ blocks-standard    │
│ (React UI)   │        │ (AST → HTML/text)     │    │  (10 blocks)       │
└──────┬───────┘        └────────────┬──────────┘    └──────────┬─────────┘
       │                             │                          │
       │                             │  uses BlockRegistry      │
       │                             │  + RenderContext         │
       │                             │                          │
       └────────────────┬────────────┴───────────┬──────────────┘
                        │                        │
                ┌───────▼────────┐       ┌───────▼────────┐
                │  @lettera/sdk  │       │ @lettera/core  │
                │  (contracts)   │◄──────│ (document, bus,│
                │                │       │  tokens, vars) │
                └────────────────┘       └────────────────┘
```

Hard rules:

- `@lettera/core` has **zero** runtime deps except Zod and Immer.
- `@lettera/sdk` has **zero** runtime deps; it is interface-only.
- `@lettera/renderer` has **no** React imports. Safe in workers/edge.
- `@lettera/editor` is the only package allowed to depend on React,
  Tiptap, dnd-kit, Zustand.

## Data flow

1. **Document load.** Host passes `EmailDocument` to `<LetteraEditor>`.
   The component creates a Zustand store seeded with that document and
   registers it in `EditorStoreContext`.
2. **Mutation.** UI fires actions → store dispatches a *command* through
   the command bus. Each command is a pure `(state, payload) ⇒ state`
   function wrapped in Immer; the bus pushes it onto the undo stack.
3. **Render.** Selectors derive view state. The canvas iframe re-renders
   on every store change via `@lettera/renderer` in `mode: 'preview'`.
4. **Persistence.** `usePersistence` subscribes to the store, debounces
   by `autosaveDelay`, and calls the host `onSave` with an
   `AbortSignal` that aborts when a newer save begins.
5. **Export.** Server side, the host imports `render()` from
   `@lettera/email-builder/server` with `mode: 'export'` to emit
   merge-tag HTML for the ESP.

## Command bus

Commands live in `packages/core/src/commands/standard.ts`. Every
mutation is a command — including `loadDocument` and the linter's
quick-fix dispatches. This means:

- Undo / redo cost is one Immer patch per command, not a doc snapshot.
- Commands are JSON-serializable → usable for collaborative sync,
  audit logs, replay.
- Custom blocks ship their own commands by extending the union; the bus
  validates against a `ZodDiscriminatedUnion`.

## Block registry

A `BlockRegistry` is a `Map<type, BlockDefinition>`.

- The **renderer** receives a registry per `render()` call. Pure.
- The **editor** uses a singleton registry (set via `setRegistry`).
  This is why custom blocks must call `setRegistry` *before* the
  editor first renders.

Block authoring is documented in [custom-blocks.md](custom-blocks.md).

## Variables

Two coexisting models:

- **Flat** `VariableDefinition[]` — legacy, Mailchimp-style merge tags.
- **Typed** `VariableSchema` — tree of scalar / object / list nodes
  with sample values and per-kind formatters. Repeater + Conditional
  blocks are typed-schema-only.

The renderer prefers the schema when both are supplied.

## Reference API (`apps/api`)

Fastify + Prisma + Postgres. Owns:

- Auth (email + password, bcrypt, JWT in `httpOnly` cookie).
- Workspaces, members, projects, documents, versions.
- Per-IP rate limits (separate budget on `/auth/*`).
- Origin-guard CSRF protection (state-changing requests must come from
  an allow-listed origin).

Schema lives in `apps/api/prisma/schema.prisma`.

## Reference web app (`apps/web`)

Next.js 14 App Router. Demonstrates:

- Cookie-session auth flow (login, register, `/auth/me`).
- Documents list + editor page with autosave + version history.
- `next/dynamic` import of the editor with `ssr: false`.

Use it as a copy-paste template for your own integration.
