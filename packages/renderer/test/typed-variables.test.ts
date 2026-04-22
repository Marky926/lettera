import { standardBlocks } from '@lettera/blocks-standard';
import { createEmptyDocument, type EmailDocument, type VariableSchema } from '@lettera/core';
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
        firstName: { kind: 'string', sample: 'Sample' },
        fee: { kind: 'currency', currency: 'EUR', sample: 9.99 },
      },
    },
  },
};

function docWithText(html: string): EmailDocument {
  const doc = createEmptyDocument('Typed');
  doc.root[0]!.children[0]!.children[0]!.children = [
    { id: 't1', type: 'block.text', props: { html, styleRef: 'body' } },
  ];
  return doc;
}

describe('renderer typed schema', () => {
  it('substitutes typed values from data in preview mode', () => {
    const doc = docWithText('Ahoj {{customer.firstName}}!');
    const out = render(doc, {
      registry: reg(),
      mode: 'preview',
      schema,
      data: { customer: { firstName: 'Jana', fee: 12.5 } },
    });
    expect(out.html).toContain('Ahoj Jana!');
  });

  it('falls back to schema sample when data missing', () => {
    const doc = docWithText('Ahoj {{customer.firstName}}!');
    const out = render(doc, { registry: reg(), mode: 'preview', schema });
    expect(out.html).toContain('Ahoj Sample!');
  });

  it('formats currency from schema kind without explicit pipe', () => {
    const doc = docWithText('Suma: {{customer.fee}}');
    const out = render(doc, {
      registry: reg(),
      mode: 'preview',
      schema,
      data: { customer: { fee: 12.5 } },
    });
    // Locale-dependent — assert digits + currency marker
    expect(out.html).toMatch(/12,?[.,]50/);
    expect(out.html).toMatch(/€|EUR/);
  });

  it('respects explicit formatter pipe', () => {
    const doc = docWithText('{{customer.firstName | upper}}');
    const out = render(doc, {
      registry: reg(),
      mode: 'preview',
      schema,
      data: { customer: { firstName: 'jana' } },
    });
    expect(out.html).toContain('JANA');
  });

  it('preserves merge-tag syntax in export mode', () => {
    const doc = docWithText('Ahoj {{customer.firstName}}!');
    const out = render(doc, { registry: reg(), mode: 'export', schema });
    expect(out.html).toContain('{{customer.firstName}}');
    expect(out.html).not.toContain('Sample');
  });

  it('legacy flat variables still work without schema', () => {
    const doc = docWithText('Ahoj {{user.firstName}}!');
    const out = render(doc, {
      registry: reg(),
      mode: 'preview',
      variables: [{ path: 'user.firstName', label: 'First name', sampleValue: 'Marek' }],
    });
    expect(out.html).toContain('Ahoj Marek!');
  });
});
