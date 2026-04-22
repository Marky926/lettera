import { standardBlocks } from '@lettera/blocks-standard';
import { createEmptyDocument, type EmailDocument } from '@lettera/core';
import { describe, expect, it } from 'vitest';
import { BlockRegistry, render } from '../src/index.js';

function reg() {
  const r = new BlockRegistry();
  r.registerAll(standardBlocks);
  return r;
}

/**
 * Build a document containing a single block with the given type + props.
 */
function docWith<TType extends string, TProps>(
  type: TType,
  props: TProps,
  id = 'x1',
): EmailDocument {
  const doc = createEmptyDocument('Security');
  const col = doc.root[0]!.children[0]!.children[0]!;
  col.children = [{ id, type, props } as never];
  return doc;
}

describe('renderer / security', () => {
  describe('HTML sanitisation — heading & text blocks', () => {
    it('strips <script> tags from heading html', () => {
      const doc = docWith('block.heading', {
        level: 1,
        html: 'Hi<script>alert(1)</script>',
        styleRef: 'h1',
      });
      const out = render(doc, { registry: reg() });
      expect(out.html).not.toContain('<script');
      expect(out.html).not.toContain('alert(1)');
      expect(out.html).toContain('Hi');
    });

    it('strips event-handler attributes', () => {
      const doc = docWith('block.text', {
        html: '<p onclick="alert(1)">click</p>',
        styleRef: 'body',
      });
      const out = render(doc, { registry: reg() });
      expect(out.html).not.toMatch(/onclick=/i);
      expect(out.html).toContain('click');
    });

    it('strips <img onerror> payloads', () => {
      const doc = docWith('block.text', {
        html: '<img src=x onerror="alert(1)">',
        styleRef: 'body',
      });
      const out = render(doc, { registry: reg() });
      expect(out.html).not.toMatch(/onerror/i);
      // img not in block-level allowlist
      expect(out.html).not.toMatch(/<img\b/i);
    });

    it('strips javascript: hrefs inside rich text', () => {
      const doc = docWith('block.text', {
        html: '<a href="javascript:alert(1)">x</a>',
        styleRef: 'body',
      });
      const out = render(doc, { registry: reg() });
      expect(out.html).not.toMatch(/javascript:/i);
    });

    it('strips iframes and style blocks', () => {
      const doc = docWith('block.text', {
        html: '<iframe src="http://evil.example"></iframe><style>body{display:none}</style>ok',
        styleRef: 'body',
      });
      const out = render(doc, { registry: reg() });
      expect(out.html).not.toMatch(/<iframe/i);
      expect(out.html).not.toMatch(/<style>body\{display:none\}<\/style>/i);
      expect(out.html).toContain('ok');
    });
  });

  describe('Button href whitelist', () => {
    it('rejects javascript: and replaces with #', () => {
      const doc = docWith('block.button', {
        label: 'hi',
        href: 'javascript:alert(1)',
        preset: 'primary',
        fullWidth: false,
      });
      const out = render(doc, { registry: reg() });
      expect(out.html).not.toMatch(/javascript:/i);
      expect(out.html).toMatch(/href="#"/);
      expect(out.warnings.some((w) => w.code === 'button.unsafe-href')).toBe(true);
    });

    it('rejects data: URIs', () => {
      const doc = docWith('block.button', {
        label: 'hi',
        href: 'data:text/html,<script>alert(1)</script>',
        preset: 'primary',
        fullWidth: false,
      });
      const out = render(doc, { registry: reg() });
      expect(out.html).not.toMatch(/data:text\/html/i);
      expect(out.html).toMatch(/href="#"/);
    });

    it('accepts https and mailto', () => {
      const https = render(
        docWith('block.button', {
          label: 'a',
          href: 'https://example.com',
          preset: 'primary',
          fullWidth: false,
        }),
        { registry: reg() },
      );
      const mailto = render(
        docWith('block.button', {
          label: 'b',
          href: 'mailto:x@example.com',
          preset: 'primary',
          fullWidth: false,
        }),
        { registry: reg() },
      );
      expect(https.html).toContain('href="https://example.com"');
      expect(mailto.html).toContain('href="mailto:x@example.com"');
      expect(https.warnings.filter((w) => w.code === 'button.unsafe-href')).toHaveLength(0);
    });
  });

  describe('Image src whitelist', () => {
    it('omits image when src uses javascript: scheme', () => {
      const doc = docWith('block.image', {
        src: 'javascript:alert(1)',
        alt: 'x',
      });
      const out = render(doc, { registry: reg() });
      expect(out.html).not.toMatch(/javascript:/i);
      expect(out.html).not.toMatch(/<img\b/i);
      expect(out.warnings.some((w) => w.code === 'image.unsafe-src')).toBe(true);
    });

    it('omits image when src is a data: URI', () => {
      const doc = docWith('block.image', {
        src: 'data:text/html,<script>',
        alt: 'x',
      });
      const out = render(doc, { registry: reg() });
      expect(out.html).not.toMatch(/data:text\/html/i);
    });
  });

  describe('CSS injection via node id', () => {
    it('neutralises crafted node ids in media-query selectors', () => {
      const doc = createEmptyDocument('CSS');
      const col = doc.root[0]!.children[0]!.children[0]!;
      const evilId = 'x"] { color:red } /* end';
      col.children = [
        {
          id: evilId,
          type: 'block.heading',
          props: { level: 1, html: 'Hi', styleRef: 'h1' },
          responsive: { mobile: { styles: { padding: { top: 8, right: 8, bottom: 8, left: 8 } } } },
        } as never,
      ];
      const out = render(doc, { registry: reg() });
      // cssEscape strips quotes and angle brackets, so the selector cannot
      // escape its attribute context.
      expect(out.html).not.toContain('"] { color:red }');
      expect(out.html).toContain('data-lettera-id=');
    });
  });

  describe('Raw HTML block', () => {
    it('sanitises <script> and event handlers', () => {
      const doc = docWith('block.html', {
        html: '<div onclick="alert(1)">ok</div><script>alert(1)</script>',
      });
      const out = render(doc, { registry: reg() });
      expect(out.html).not.toMatch(/<script/i);
      expect(out.html).not.toMatch(/onclick=/i);
      expect(out.html).toContain('ok');
      expect(out.warnings.some((w) => w.code === 'html.raw')).toBe(true);
    });
  });

  describe('CSS attribute breakout', () => {
    it('drops malicious theme color tokens that could break the style attribute', () => {
      const doc = docWith('block.heading', {
        level: 1,
        html: 'Hi',
        styleRef: 'h1',
      });
      // Inject a styles override through the document JSON so the renderer
      // sees a hostile string the inspector would never produce.
      doc.root[0]!.children[0]!.children[0]!.children[0]!.styles = {
        color: 'red; }body{display:none} /*' as never,
      };
      const out = render(doc, { registry: reg() });
      // The hostile fragment must NOT appear in the output anywhere.
      expect(out.html).not.toContain('}body{display:none}');
      // And there must be no stray closing brace in the heading inline style.
      expect(out.html).not.toMatch(/<h1[^>]*style="[^"]*}body\{/i);
    });

    it('drops divider color containing CSS metacharacters', () => {
      const doc = docWith('block.divider', {
        thickness: 1,
        color: 'red; background:url(javascript:alert(1)) /*',
      });
      const out = render(doc, { registry: reg() });
      expect(out.html).not.toMatch(/javascript:/i);
      expect(out.html).not.toMatch(/url\(/i);
    });

    it('clamps extreme spacer height to 2000px', () => {
      const doc = docWith('block.spacer', { height: 999_999 });
      // Schema would now reject this but we feed it through the render path
      // by bypassing schema in the test (using `as never`).
      doc.root[0]!.children[0]!.children[0]!.children[0]!.props = { height: 999_999 } as never;
      const out = render(doc, { registry: reg() });
      expect(out.html).toMatch(/height:2000px/);
      expect(out.html).not.toMatch(/height:999999/);
    });
  });

  describe('Anchor tabnabbing', () => {
    it('adds rel="noopener noreferrer" to target=_blank links in rich text', () => {
      const doc = docWith('block.text', {
        html: '<a href="https://example.com" target="_blank">x</a>',
        styleRef: 'body',
      });
      const out = render(doc, { registry: reg() });
      expect(out.html).toMatch(/rel="[^"]*noopener[^"]*noreferrer/);
    });

    it('preserves existing rel tokens when adding noopener/noreferrer', () => {
      const doc = docWith('block.text', {
        html: '<a href="https://example.com" target="_blank" rel="nofollow">x</a>',
        styleRef: 'body',
      });
      const out = render(doc, { registry: reg() });
      expect(out.html).toMatch(/rel="[^"]*nofollow[^"]*noopener[^"]*noreferrer/);
    });
  });
});
