/**
 * Tiny HTML utilities used by the renderer skeleton.
 *
 * Kept dependency-free: blocks emit inline styles already. Future work plugs
 * `juice` in `inline.ts` to merge `<style>` blocks into inline attributes for
 * Gmail compatibility (media queries are preserved in `<head>`).
 */
const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]!);
}

/**
 * Escape a value destined to appear inside a CSS string/attribute selector or
 * property value. Strips control characters and neutralises characters that
 * could break out of the current context (quotes, backslashes, braces, angle
 * brackets, newlines). Not a full CSS.escape — we only emit tightly-scoped
 * strings (nanoid-generated ids, theme colour tokens) so a conservative
 * allowlist is sufficient and keeps output readable.
 */
export function cssEscape(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: explicit rejection of control chars is the point
  return value.replace(/[\0-\x1F\x7F"'\\<>{}\n\r]/g, '');
}

/**
 * Strip HTML tags and decode the most common entities for the plain-text part.
 * Not bulletproof; sufficient for marketing-email plain-text fallbacks.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
