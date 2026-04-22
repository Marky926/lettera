# @lettera/blocks-standard

Built-in block library. Register these with your `BlockRegistry` to get
the common primitives every email needs.

```bash
pnpm add @lettera/blocks-standard @lettera/renderer
```

```ts
import { BlockRegistry } from '@lettera/renderer';
import { standardBlocks } from '@lettera/blocks-standard';

const registry = new BlockRegistry();
registry.registerAll(standardBlocks);
```

## Included blocks

| Block | Type | Category |
| --- | --- | --- |
| Heading | `block.heading` | Content |
| Text | `block.text` | Content |
| Button | `block.button` | Marketing |
| Image | `block.image` | Media |
| Spacer | `block.spacer` | Layout |
| Divider | `block.divider` | Layout |
| Html | `block.html` | Advanced |
| Repeater | `block.repeater` | Advanced |
| Conditional | `block.conditional` | Advanced |

Each export (`HeadingBlock`, `TextBlock`, …) is a `BlockDefinition`
produced by `defineBlock` — fully typed propsSchema, defaultProps,
export render function, and inspector schema.

## Individual registration

```ts
import { HeadingBlock, ButtonBlock } from '@lettera/blocks-standard';
registry.register(HeadingBlock);
registry.register(ButtonBlock);
```

## Authoring your own

See [`docs/custom-blocks.md`](../../docs/custom-blocks.md).
