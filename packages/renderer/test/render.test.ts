import { standardBlocks } from '@lettera/blocks-standard';
import { createEmptyDocument, type EmailDocument } from '@lettera/core';
import { describe, expect, it } from 'vitest';
import { BlockRegistry, render } from '../src/index.js';

function reg() {
  const r = new BlockRegistry();
  r.registerAll(standardBlocks);
  return r;
}

describe('renderer', () => {
  it('renders an empty document with valid skeleton', () => {
    const doc = createEmptyDocument('Empty');
    const out = render(doc, { registry: reg() });
    expect(out.html).toContain('<!doctype html>');
    expect(out.html).toContain('role="article"');
    expect(out.warnings).toHaveLength(0);
  });

  it('renders heading + button blocks with token-resolved colors', () => {
    const doc: EmailDocument = createEmptyDocument('Welcome');
    const col = doc.root[0]!.children[0]!.children[0]!;
    col.children = [
      {
        id: 'h1',
        type: 'block.heading',
        props: { level: 1, html: 'Hello {{user.firstName}}', styleRef: 'h1' },
      },
      {
        id: 'btn',
        type: 'block.button',
        props: {
          label: 'Get started',
          href: 'https://example.com',
          preset: 'primary',
          fullWidth: false,
        },
      },
    ];
    const out = render(doc, { registry: reg() });
    expect(out.html).toContain('Hello {{user.firstName}}');
    expect(out.html).toContain('href="https://example.com"');
    // brand primary token resolved into inline style
    expect(out.html).toContain('#1F6FEB');
    // VML for outlook
    expect(out.html).toContain('v:roundrect');
    // plain-text fallback
    expect(out.text).toContain('Hello {{user.firstName}}');
    expect(out.text).toContain('Get started → https://example.com');
  });

  it('warns when image is missing alt text', () => {
    const doc = createEmptyDocument('Image');
    const col = doc.root[0]!.children[0]!.children[0]!;
    col.children = [
      {
        id: 'img1',
        type: 'block.image',
        props: { src: 'https://example.com/x.png', alt: '' },
      },
    ];
    const out = render(doc, { registry: reg() });
    expect(out.warnings.some((w) => w.code === 'image.missing-alt')).toBe(true);
  });

  it('emits mobile media query rules from responsive overrides', () => {
    const doc = createEmptyDocument('Resp');
    const col = doc.root[0]!.children[0]!.children[0]!;
    col.children = [
      {
        id: 'h1',
        type: 'block.heading',
        props: { level: 1, html: 'Hi', styleRef: 'h1' },
        responsive: { mobile: { styles: { padding: { top: 8, right: 8, bottom: 8, left: 8 } } } },
      },
    ];
    const out = render(doc, { registry: reg() });
    expect(out.html).toContain('max-width:600px');
    expect(out.html).toContain('[data-lettera-id="h1"]');
    expect(out.html).toContain('padding:8px 8px 8px 8px !important');
  });

  it('substitutes variable spans (preview vs export) and supports custom formatter', () => {
    const doc = createEmptyDocument('Vars');
    const col = doc.root[0]!.children[0]!.children[0]!;
    col.children = [
      {
        id: 'h1',
        type: 'block.heading',
        props: {
          level: 1,
          html: 'Hello <span data-lettera-var="user.firstName">First</span>!',
          styleRef: 'h1',
        },
      },
    ];
    const variables = [{ path: 'user.firstName', label: 'First name', sampleValue: 'Ada' }];

    const preview = render(doc, { registry: reg(), variables, mode: 'preview' });
    expect(preview.html).toContain('Hello Ada!');
    expect(preview.html).not.toContain('data-lettera-var');

    const exported = render(doc, { registry: reg(), variables, mode: 'export' });
    expect(exported.html).toContain('Hello {{user.firstName}}!');

    const mailchimp = render(doc, {
      registry: reg(),
      variables,
      mode: 'export',
      mergeTagFormatter: ({ path }) => `*|${path.replace(/\./g, '_').toUpperCase()}|*`,
    });
    expect(mailchimp.html).toContain('Hello *|USER_FIRSTNAME|*!');
  });

  it('applies typography overrides on heading / text / button', () => {
    const doc: EmailDocument = createEmptyDocument('Typo');
    const col = doc.root[0]!.children[0]!.children[0]!;
    col.children = [
      {
        id: 'h',
        type: 'block.heading',
        props: {
          level: 1,
          html: 'Big',
          styleRef: 'h1',
          fontSize: 48,
          lineHeight: 1.1,
          letterSpacing: -1,
          textTransform: 'uppercase',
        },
      },
      {
        id: 't',
        type: 'block.text',
        props: {
          html: '<p>Body</p>',
          styleRef: 'body',
          fontSize: 18,
          letterSpacing: 0.5,
        },
      },
      {
        id: 'b',
        type: 'block.button',
        props: {
          label: 'Go',
          href: 'https://example.com',
          preset: 'primary',
          fullWidth: false,
          fontSize: 20,
          fontWeight: 800,
          letterSpacing: 1,
          textTransform: 'uppercase',
        },
      },
    ];
    const out = render(doc, { registry: reg() });
    // heading overrides emitted
    expect(out.html).toMatch(
      /<h1[^>]*style="[^"]*font-size:48px[^"]*line-height:1\.1[^"]*letter-spacing:-1px[^"]*text-transform:uppercase/,
    );
    // text overrides emitted
    expect(out.html).toMatch(/<div[^>]*style="[^"]*font-size:18px[^"]*letter-spacing:0\.5px/);
    // button overrides — both VML and <a> get the font size / weight
    expect(out.html).toContain('font-size:20px');
    expect(out.html).toContain('font-weight:800');
    // button transform/spacing applied to <a>
    expect(out.html).toMatch(/<a[^>]*style="[^"]*letter-spacing:1px[^"]*text-transform:uppercase/);
  });
});
