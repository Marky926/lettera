import { standardBlocks } from '@lettera/blocks-standard';
import {
  type ConditionalBlock,
  createEmptyDocument,
  type EmailDocument,
  type RepeaterBlock,
  type VariableSchema,
} from '@lettera/core';
import { describe, expect, it } from 'vitest';
import { BlockRegistry, render } from '../src/index.js';

function reg() {
  const r = new BlockRegistry();
  r.registerAll(standardBlocks);
  return r;
}

const schema: VariableSchema = {
  fields: {
    customer: {
      kind: 'object',
      fields: {
        isPremium: { kind: 'boolean', sample: true },
        name: { kind: 'string', sample: 'Sample' },
      },
    },
    services: {
      kind: 'list',
      item: {
        kind: 'object',
        fields: {
          name: { kind: 'string', sample: 'Service' },
          fee: { kind: 'currency', currency: 'EUR', sample: 0 },
        },
      },
    },
  },
};

function docWithBlocks(
  blocks:
    | RepeaterBlock[]
    | ConditionalBlock[]
    | EmailDocument['root'][number]['children'][number]['children'][number]['children'],
): EmailDocument {
  const doc = createEmptyDocument('Dynamic');
  // biome-ignore lint/suspicious/noExplicitAny: test helper accepts any block array.
  doc.root[0]!.children[0]!.children[0]!.children = blocks as any;
  return doc;
}

describe('repeater block', () => {
  const repeater: RepeaterBlock = {
    id: 'rep1',
    type: 'block.repeater',
    props: { source: 'services', as: 'service' },
    children: [
      {
        id: 't1',
        type: 'block.text',
        props: { html: 'Service: {{service.name}} — {{service.fee}}', styleRef: 'body' },
      },
    ],
  };

  it('iterates over data with scoped alias', () => {
    const out = render(docWithBlocks([repeater]), {
      registry: reg(),
      mode: 'preview',
      schema,
      data: {
        services: [
          { name: 'Plyn', fee: 12.5 },
          { name: 'Elektrina', fee: 30 },
        ],
      },
    });
    expect(out.html).toContain('Service: Plyn');
    expect(out.html).toContain('Service: Elektrina');
    // currency formatted via schema kind
    expect(out.html).toMatch(/12,?[.,]50/);
  });

  it('falls back to template preview without data', () => {
    const out = render(docWithBlocks([repeater]), {
      registry: reg(),
      mode: 'preview',
      schema,
    });
    // Renders the body once; service.name resolves to '' (no scope) — schema sample
    // applies to the path 'services[].name' but bare 'service.name' has no schema.
    // We at least expect the wrapping HTML structure and no crash.
    expect(out.html).toContain('Service:');
    expect(out.warnings).toHaveLength(0);
  });

  it('shows emptyText when source is empty array', () => {
    const repWithEmpty: RepeaterBlock = {
      ...repeater,
      props: { source: 'services', as: 'service', emptyText: 'No services.' },
    };
    const out = render(docWithBlocks([repWithEmpty]), {
      registry: reg(),
      mode: 'preview',
      schema,
      data: { services: [] },
    });
    expect(out.html).toContain('No services.');
  });
});

describe('conditional block', () => {
  const cond: ConditionalBlock = {
    id: 'cond1',
    type: 'block.conditional',
    props: { when: 'customer.isPremium' },
    children: [
      { id: 'p1', type: 'block.text', props: { html: 'Welcome premium!', styleRef: 'body' } },
    ],
    else: [{ id: 'p2', type: 'block.text', props: { html: 'Upgrade now', styleRef: 'body' } }],
  };

  it('renders truthy branch', () => {
    const out = render(docWithBlocks([cond]), {
      registry: reg(),
      mode: 'preview',
      schema,
      data: { customer: { isPremium: true } },
    });
    expect(out.html).toContain('Welcome premium!');
    expect(out.html).not.toContain('Upgrade now');
  });

  it('renders else branch when falsy', () => {
    const out = render(docWithBlocks([cond]), {
      registry: reg(),
      mode: 'preview',
      schema,
      data: { customer: { isPremium: false } },
    });
    expect(out.html).toContain('Upgrade now');
    expect(out.html).not.toContain('Welcome premium!');
  });

  it('supports comparison expressions', () => {
    const cond2: ConditionalBlock = {
      ...cond,
      props: { when: 'customer.name == "Jana"' },
    };
    const out = render(docWithBlocks([cond2]), {
      registry: reg(),
      mode: 'preview',
      schema,
      data: { customer: { name: 'Jana' } },
    });
    expect(out.html).toContain('Welcome premium!');
  });
});
