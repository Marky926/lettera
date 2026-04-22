import { describe, expect, it } from 'vitest';
import { defaultFormatters } from '../src/formatters.js';
import {
  compileExpression,
  ExprError,
  flatVariablesToSchema,
  listSchemaEntries,
  parseFormatterSpec,
  parseVariablePath,
  resolveSchemaPath,
  resolveValuePath,
  safeEval,
  schemaToFlatVariables,
  type VariableSchema,
} from '../src/index.js';

const utilitySchema: VariableSchema = {
  fields: {
    customer: {
      kind: 'object',
      label: 'Customer',
      fields: {
        firstName: { kind: 'string', label: 'First name', sample: 'Jana' },
        email: { kind: 'email', sample: 'jana@example.com' },
        address: {
          kind: 'object',
          fields: {
            city: { kind: 'string', sample: 'Bratislava' },
          },
        },
      },
    },
    services: {
      kind: 'list',
      label: 'Services',
      sampleCount: 2,
      item: {
        kind: 'object',
        fields: {
          name: { kind: 'string', sample: 'Plyn' },
          monthlyFee: { kind: 'currency', currency: 'EUR', sample: 12.34 },
          active: { kind: 'boolean', sample: true },
        },
      },
    },
  },
};

describe('parseVariablePath', () => {
  it('splits dotted paths', () => {
    expect(parseVariablePath('customer.address.city')).toEqual(['customer', 'address', 'city']);
  });
  it('splits bracket indices', () => {
    expect(parseVariablePath('services[0].name')).toEqual(['services', '0', 'name']);
  });
  it('handles trailing brackets', () => {
    expect(parseVariablePath('services[].name')).toEqual(['services', '', 'name']);
  });
});

describe('resolveSchemaPath', () => {
  it('walks objects', () => {
    expect(resolveSchemaPath(utilitySchema, 'customer.firstName')?.kind).toBe('string');
    expect(resolveSchemaPath(utilitySchema, 'customer.address.city')?.kind).toBe('string');
  });
  it('walks list items via numeric and field segments', () => {
    expect(resolveSchemaPath(utilitySchema, 'services[0].name')?.kind).toBe('string');
    expect(resolveSchemaPath(utilitySchema, 'services.monthlyFee')?.kind).toBe('currency');
  });
  it('returns undefined for unknown paths', () => {
    expect(resolveSchemaPath(utilitySchema, 'unknown')).toBeUndefined();
    expect(resolveSchemaPath(utilitySchema, 'customer.nope')).toBeUndefined();
  });
});

describe('resolveValuePath', () => {
  const ctx = {
    customer: { firstName: 'Jana', address: { city: 'Bratislava' } },
    services: [{ name: 'Plyn' }, { name: 'Elektrina' }],
  } as const;

  it('resolves nested paths', () => {
    expect(resolveValuePath(ctx, 'customer.firstName')).toBe('Jana');
    expect(resolveValuePath(ctx, 'customer.address.city')).toBe('Bratislava');
  });
  it('resolves array indices', () => {
    expect(resolveValuePath(ctx, 'services[1].name')).toBe('Elektrina');
  });
  it('returns undefined for missing paths', () => {
    expect(resolveValuePath(ctx, 'customer.surname')).toBeUndefined();
  });
  it('uses scope before context for first segment', () => {
    expect(resolveValuePath(ctx, 'service.name', { service: { name: 'Voda' } })).toBe('Voda');
  });
});

describe('listSchemaEntries', () => {
  it('flattens objects, includes list paths and item-scoped fields', () => {
    const entries = listSchemaEntries(utilitySchema);
    const paths = entries.map((e) => e.path);
    expect(paths).toContain('customer.firstName');
    expect(paths).toContain('customer.address.city');
    expect(paths).toContain('services');
    expect(paths).toContain('services[].name');
    expect(paths).toContain('services[].monthlyFee');
  });
});

describe('flat compatibility', () => {
  it('round-trips flat → schema → flat', () => {
    const flat = [
      { path: 'a', label: 'A', type: 'string' as const },
      { path: 'b', label: 'B', type: 'currency' as const },
    ];
    const schema = flatVariablesToSchema(flat);
    const out = schemaToFlatVariables(schema);
    expect(out).toEqual([
      { path: 'a', label: 'A', group: 'a', type: 'string' },
      { path: 'b', label: 'B', group: 'b', type: 'currency' },
    ]);
  });
});

describe('expression compiler', () => {
  const ctx = {
    customer: { age: 30, isActive: true, name: 'Jana' },
    services: [{ name: 'A' }, { name: 'B' }],
  };

  it('evaluates literals + paths', () => {
    expect(compileExpression('customer.age').evaluate(ctx)).toBe(30);
    expect(compileExpression('"hello"').evaluate(ctx)).toBe('hello');
  });

  it('evaluates comparisons', () => {
    expect(compileExpression('customer.age >= 18').evaluate(ctx)).toBe(true);
    expect(compileExpression('customer.age == "30"').evaluate(ctx)).toBe(true);
    expect(compileExpression('customer.name != "Bob"').evaluate(ctx)).toBe(true);
  });

  it('short-circuits && and ||', () => {
    expect(compileExpression('customer.isActive && customer.age > 18').evaluate(ctx)).toBe(true);
    expect(compileExpression('false || customer.name').evaluate(ctx)).toBe('Jana');
  });

  it('handles unary !', () => {
    expect(compileExpression('!customer.isActive').evaluate(ctx)).toBe(false);
    expect(compileExpression('!customer.missing').evaluate(ctx)).toBe(true);
  });

  it('uses scope for first segment', () => {
    const expr = compileExpression('service.name == "A"');
    expect(expr.evaluate(ctx, { service: { name: 'A' } })).toBe(true);
  });

  it('rejects unknown syntax', () => {
    expect(() => compileExpression('foo + bar')).toThrow(ExprError);
    expect(() => compileExpression('eval("oops")')).toThrow(ExprError);
  });

  it('safeEval never throws on bad input', () => {
    expect(safeEval('::garbage::', ctx)).toBeUndefined();
  });
});

describe('formatters', () => {
  it('formats currency', () => {
    const out = defaultFormatters.apply(12.5, 'currency', ['EUR']);
    expect(out).toMatch(/12,?[.,]50/);
    expect(out).toMatch(/€|EUR/);
  });
  it('formats date iso', () => {
    expect(defaultFormatters.apply('2026-04-21', 'date', ['iso'])).toBe('2026-04-21');
  });
  it('default fallback', () => {
    expect(defaultFormatters.apply(null, 'default', ['Hello'])).toBe('Hello');
    expect(defaultFormatters.apply('Jana', 'default', ['Hello'])).toBe('Jana');
  });
  it('upper / lower', () => {
    expect(defaultFormatters.apply('jana', 'upper', [])).toBe('JANA');
    expect(defaultFormatters.apply('JANA', 'lower', [])).toBe('jana');
  });
  it('unknown formatter falls back to String()', () => {
    expect(defaultFormatters.apply(42, 'nope', [])).toBe('42');
  });
});

describe('parseFormatterSpec', () => {
  it('parses name and args', () => {
    expect(parseFormatterSpec('currency:EUR')).toEqual({ name: 'currency', args: ['EUR'] });
    expect(parseFormatterSpec('upper')).toEqual({ name: 'upper', args: [] });
  });
});
