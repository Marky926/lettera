/**
 * Value formatters used by inline merge tags: `{{path | format:arg}}`.
 *
 * Each formatter is a deterministic, host-supplied or built-in function from
 * `(value, ...args) → string`. The renderer applies them after path
 * resolution and before HTML-escaping. Formatters should never return raw
 * HTML — the escape pass treats every output as text.
 */

export type Formatter = (value: unknown, ...args: string[]) => string;

const builtIns: Record<string, Formatter> = {
  /** `currency:EUR` — prefers Intl.NumberFormat, falls back to fixed-2 + suffix. */
  currency(value, code = 'EUR') {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(n);
    } catch {
      return `${n.toFixed(2)} ${code}`;
    }
  },

  /** `number` or `number:2` — fixed decimals, locale-aware grouping. */
  number(value, decimals = '0') {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    const d = Math.max(0, Math.min(20, Number(decimals) || 0));
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(n);
  },

  /** `date` (YYYY-MM-DD) or `date:long` (locale long form). */
  date(value, style = 'short') {
    const d = toDate(value);
    if (!d) return '';
    if (style === 'iso') return d.toISOString().slice(0, 10);
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: style as 'short' | 'medium' | 'long' | 'full',
    }).format(d);
  },

  /** `datetime` — date + time, locale short by default. */
  datetime(value, style = 'short') {
    const d = toDate(value);
    if (!d) return '';
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: style as 'short' | 'medium' | 'long' | 'full',
      timeStyle: 'short',
    }).format(d);
  },

  /** `upper` — locale-aware uppercase. */
  upper(value) {
    return String(value ?? '').toLocaleUpperCase();
  },
  lower(value) {
    return String(value ?? '').toLocaleLowerCase();
  },

  /** `default:Hello` — substitutes when value is null/undefined/empty. */
  default(value, fallback = '') {
    if (value == null || value === '') return fallback;
    return String(value);
  },
};

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Registry of available formatters. Ships with the built-ins above; hosts can
 * `register()` additional ones (e.g. `phoneNumber`, `address`) before
 * rendering. The registry is intentionally process-global because formatters
 * are pure and identifier-keyed — there's no benefit to per-instance scoping.
 */
export class FormatterRegistry {
  private readonly entries = new Map<string, Formatter>();

  constructor() {
    for (const [name, fn] of Object.entries(builtIns)) this.entries.set(name, fn);
  }

  register(name: string, fn: Formatter): void {
    this.entries.set(name, fn);
  }

  get(name: string): Formatter | undefined {
    return this.entries.get(name);
  }

  /** Apply a formatter pipe. Unknown formatter names degrade to `String(value)`. */
  apply(value: unknown, name: string, args: string[]): string {
    const fn = this.entries.get(name);
    if (!fn) return value == null ? '' : String(value);
    try {
      return fn(value, ...args);
    } catch {
      return value == null ? '' : String(value);
    }
  }
}

/** Default singleton registry — used by `render()` when no override is supplied. */
export const defaultFormatters = new FormatterRegistry();

/**
 * Parse a single formatter pipe segment like `currency:EUR` into its name +
 * args. Args are split on `:` and trimmed; nested colons inside string
 * literals are out of scope (formatters expect simple primitive args).
 */
export function parseFormatterSpec(spec: string): { name: string; args: string[] } {
  const trimmed = spec.trim();
  const idx = trimmed.indexOf(':');
  if (idx < 0) return { name: trimmed, args: [] };
  const name = trimmed.slice(0, idx).trim();
  const rest = trimmed.slice(idx + 1);
  return { name, args: rest.split(':').map((s) => s.trim()) };
}
