# @lettera/editor

React editor component, Zustand store, and persistence hooks. The
browser-side half of Lettera.

```bash
pnpm add @lettera/editor react react-dom
```

```tsx
import { LetteraEditor } from '@lettera/editor';
import '@lettera/editor/styles.css';

<LetteraEditor document={doc} onSave={async (doc, { signal }) => { ... }} />
```

## Exports

| Symbol | Purpose |
| --- | --- |
| `LetteraEditor` | The editor React component |
| `LetteraEditorProps`, `LetteraLayout` | Component prop types |
| `createEditorStore`, `useEditorStore`, `useEditorStoreApi` | Zustand store primitives |
| `getRegistry`, `setRegistry` | Block registry for the editor |
| `usePersistence`, `useVersions`, `usePreview` | Integration hooks |

## Component props

| Prop | Default | Purpose |
| --- | --- | --- |
| `document` | required | Initial `EmailDocument` |
| `variables` | `[]` | Flat legacy variable list |
| `schema` | — | Typed `VariableSchema` |
| `data` | — | Runtime values for preview |
| `layout` | `'classic'` | `'classic'` (three-pane) or `'compact'` (single right panel) |
| `versionsPanel` | — | ReactNode rendered inside the right panel |
| `onDocumentChange` | — | Called on every store mutation |
| `onSave` | — | Debounced autosave callback |
| `autosaveDelay` | `1500` | Debounce for `onSave` in ms |
| `onSaveError` | — | Called when `onSave` rejects |
| `store` | — | Advanced: provide your own store instance |

## Hooks subpath

```ts
// Same as the main barrel, but without the component — useful when
// you need tree-shaking or you're calling the hooks from a sibling
// component outside the editor tree.
import { usePersistence } from '@lettera/editor/hooks';
```

## Documentation

- [Getting started](../../docs/getting-started.md)
- [Integration guide](../../docs/integration.md)
- [Variables & merge tags](../../docs/variables.md)
- [Custom blocks](../../docs/custom-blocks.md)
