/**
 * Tiny, safe expression language for templates.
 *
 * Used by:
 *   - the conditional block (`{{#if}}` body): an expression evaluating to a boolean,
 *   - the inline `{{path | format}}` formatter pipe inside merge tags,
 *   - lint-time path validation.
 *
 * **Why a custom mini-parser instead of Handlebars/Liquid?**
 *
 *   1. *Bundle size* — we ship the editor in a Next.js client bundle. A 30 kB
 *      template engine is a hard sell for what amounts to dotted paths and a
 *      handful of operators.
 *   2. *Security* — `Function`, `with`, dynamic property access on prototypes
 *      have all bitten template engines historically. By writing the parser
 *      ourselves we can keep the surface small enough to reason about.
 *   3. *Determinism* — every operator and every formatter is registered
 *      explicitly. Anything not on the allow-list is a parse error, not a
 *      runtime surprise.
 *
 * Grammar (informal):
 *
 *     expr        := orExpr
 *     orExpr      := andExpr ('||' andExpr)*
 *     andExpr     := compareExpr ('&&' compareExpr)*
 *     compareExpr := unary (('=='|'!='|'<'|'<='|'>'|'>=') unary)?
 *     unary       := '!' unary | primary
 *     primary     := literal | path | '(' expr ')'
 *     path        := IDENT ('.' IDENT | '[' (digits|STRING) ']')*
 *     literal     := number | STRING | 'true' | 'false' | 'null'
 *
 * Anything outside this grammar is rejected at parse time. Evaluation is
 * pure: it only reads from the supplied `(ctx, scope)` pair and never calls
 * out to host code.
 */

import { resolveValuePath, type VariableContext } from './variableSchema.js';

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

type Literal = { t: 'lit'; v: string | number | boolean | null };
type Path = { t: 'path'; v: string };
type Unary = { t: 'unary'; op: '!'; arg: Expr };
type Binary = {
  t: 'bin';
  op: '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||';
  l: Expr;
  r: Expr;
};
type Expr = Literal | Path | Unary | Binary;

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

interface Token {
  kind:
    | 'num'
    | 'str'
    | 'ident'
    | 'true'
    | 'false'
    | 'null'
    | 'lparen'
    | 'rparen'
    | 'lbracket'
    | 'rbracket'
    | 'dot'
    | 'op'
    | 'bang';
  value?: string | number;
}

function tokenize(input: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    if (ch === '(') {
      out.push({ kind: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      out.push({ kind: 'rparen' });
      i++;
      continue;
    }
    if (ch === '[') {
      out.push({ kind: 'lbracket' });
      i++;
      continue;
    }
    if (ch === ']') {
      out.push({ kind: 'rbracket' });
      i++;
      continue;
    }
    if (ch === '.') {
      out.push({ kind: 'dot' });
      i++;
      continue;
    }
    if (ch === '!' && input[i + 1] !== '=') {
      out.push({ kind: 'bang' });
      i++;
      continue;
    }
    // Operators (longest match first).
    const two = input.slice(i, i + 2);
    if (
      two === '==' ||
      two === '!=' ||
      two === '<=' ||
      two === '>=' ||
      two === '&&' ||
      two === '||'
    ) {
      out.push({ kind: 'op', value: two });
      i += 2;
      continue;
    }
    if (ch === '<' || ch === '>') {
      out.push({ kind: 'op', value: ch });
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let buf = '';
      while (j < input.length && input[j] !== quote) {
        if (input[j] === '\\' && j + 1 < input.length) {
          buf += input[j + 1];
          j += 2;
        } else {
          buf += input[j];
          j++;
        }
      }
      if (j >= input.length) throw new ExprError(`Unterminated string at ${i}`);
      out.push({ kind: 'str', value: buf });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j]!)) j++;
      const n = Number(input.slice(i, j));
      if (Number.isNaN(n)) throw new ExprError(`Invalid number at ${i}`);
      out.push({ kind: 'num', value: n });
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_$]/.test(input[j]!)) j++;
      const word = input.slice(i, j);
      if (word === 'true') out.push({ kind: 'true' });
      else if (word === 'false') out.push({ kind: 'false' });
      else if (word === 'null') out.push({ kind: 'null' });
      else out.push({ kind: 'ident', value: word });
      i = j;
      continue;
    }
    throw new ExprError(`Unexpected character '${ch}' at ${i}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export class ExprError extends Error {}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): Expr {
    const e = this.orExpr();
    if (this.pos < this.tokens.length) {
      throw new ExprError(`Unexpected token at position ${this.pos}`);
    }
    return e;
  }

  private orExpr(): Expr {
    let left = this.andExpr();
    while (this.matchOp('||')) {
      const right = this.andExpr();
      left = { t: 'bin', op: '||', l: left, r: right };
    }
    return left;
  }

  private andExpr(): Expr {
    let left = this.compareExpr();
    while (this.matchOp('&&')) {
      const right = this.compareExpr();
      left = { t: 'bin', op: '&&', l: left, r: right };
    }
    return left;
  }

  private compareExpr(): Expr {
    const left = this.unary();
    const t = this.peek();
    if (
      t?.kind === 'op' &&
      (t.value === '==' ||
        t.value === '!=' ||
        t.value === '<' ||
        t.value === '<=' ||
        t.value === '>' ||
        t.value === '>=')
    ) {
      this.pos++;
      const right = this.unary();
      return { t: 'bin', op: t.value as Binary['op'], l: left, r: right };
    }
    return left;
  }

  private unary(): Expr {
    if (this.peek()?.kind === 'bang') {
      this.pos++;
      return { t: 'unary', op: '!', arg: this.unary() };
    }
    return this.primary();
  }

  private primary(): Expr {
    const t = this.peek();
    if (!t) throw new ExprError('Unexpected end of expression');
    if (t.kind === 'num') {
      this.pos++;
      return { t: 'lit', v: t.value as number };
    }
    if (t.kind === 'str') {
      this.pos++;
      return { t: 'lit', v: t.value as string };
    }
    if (t.kind === 'true') {
      this.pos++;
      return { t: 'lit', v: true };
    }
    if (t.kind === 'false') {
      this.pos++;
      return { t: 'lit', v: false };
    }
    if (t.kind === 'null') {
      this.pos++;
      return { t: 'lit', v: null };
    }
    if (t.kind === 'lparen') {
      this.pos++;
      const e = this.orExpr();
      this.expect('rparen');
      return e;
    }
    if (t.kind === 'ident') {
      return this.path();
    }
    throw new ExprError(`Unexpected token ${t.kind}`);
  }

  private path(): Expr {
    const first = this.expect('ident').value as string;
    let p = first;
    // Chain of `.ident` or `[idx]` segments.
    while (true) {
      const t = this.peek();
      if (t?.kind === 'dot') {
        this.pos++;
        const id = this.expect('ident').value as string;
        p += `.${id}`;
      } else if (t?.kind === 'lbracket') {
        this.pos++;
        const inner = this.peek();
        if (inner?.kind === 'num') {
          this.pos++;
          p += `[${inner.value}]`;
        } else if (inner?.kind === 'str') {
          this.pos++;
          p += `[${JSON.stringify(inner.value)}]`;
        } else {
          throw new ExprError('Bracket index must be a number or string literal');
        }
        this.expect('rbracket');
      } else {
        break;
      }
    }
    return { t: 'path', v: p };
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private matchOp(op: string): boolean {
    const t = this.peek();
    if (t?.kind === 'op' && t.value === op) {
      this.pos++;
      return true;
    }
    return false;
  }
  private expect(kind: Token['kind']): Token {
    const t = this.peek();
    if (!t || t.kind !== kind) throw new ExprError(`Expected ${kind} at position ${this.pos}`);
    this.pos++;
    return t;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CompiledExpression {
  readonly source: string;
  evaluate(ctx: VariableContext, scope?: Readonly<Record<string, unknown>>): unknown;
}

/**
 * Parse `source` once and return a compiled, reusable evaluator. Throws
 * `ExprError` synchronously when the source is malformed; production callers
 * should validate at template-save time, not at render time.
 */
export function compileExpression(source: string): CompiledExpression {
  const ast = new Parser(tokenize(source)).parse();
  return {
    source,
    evaluate(ctx, scope) {
      return evalAst(ast, ctx, scope);
    },
  };
}

/**
 * Convenience helper: parse + evaluate. Returns `undefined` (never throws)
 * when the expression is malformed — useful at render time so a buggy
 * template degrades gracefully instead of taking the whole email down. Use
 * `compileExpression` directly when you need to surface parse errors to the
 * author.
 */
export function safeEval(
  source: string,
  ctx: VariableContext,
  scope?: Readonly<Record<string, unknown>>,
): unknown {
  try {
    return compileExpression(source).evaluate(ctx, scope);
  } catch {
    return undefined;
  }
}

/**
 * Coerce any value into the boolean used by `{{#if}}`. Mirrors JS truthiness
 * with one twist: empty arrays count as false (a missing collection should
 * hide the conditional rather than show its body).
 */
export function toBool(v: unknown): boolean {
  if (v == null || v === false || v === 0 || v === '') return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

function evalAst(
  ast: Expr,
  ctx: VariableContext,
  scope?: Readonly<Record<string, unknown>>,
): unknown {
  switch (ast.t) {
    case 'lit':
      return ast.v;
    case 'path':
      return resolveValuePath(ctx, ast.v, scope);
    case 'unary':
      return !toBool(evalAst(ast.arg, ctx, scope));
    case 'bin': {
      // Short-circuit logical operators.
      if (ast.op === '&&') {
        const l = evalAst(ast.l, ctx, scope);
        return toBool(l) ? evalAst(ast.r, ctx, scope) : l;
      }
      if (ast.op === '||') {
        const l = evalAst(ast.l, ctx, scope);
        return toBool(l) ? l : evalAst(ast.r, ctx, scope);
      }
      const l = evalAst(ast.l, ctx, scope);
      const r = evalAst(ast.r, ctx, scope);
      switch (ast.op) {
        case '==':
          return looseEq(l, r);
        case '!=':
          return !looseEq(l, r);
        case '<':
          return compare(l, r) < 0;
        case '<=':
          return compare(l, r) <= 0;
        case '>':
          return compare(l, r) > 0;
        case '>=':
          return compare(l, r) >= 0;
      }
    }
  }
}

/**
 * Loose equality with one safety lock: `null` and `undefined` are equal to
 * each other and to nothing else. This matches what authors expect when
 * checking "is this field present?" without having to learn the JS `==` quirks.
 */
function looseEq(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  // Number ↔ string coercion is intentional so `{{customer.age}} == "18"` works.
  if (typeof a === 'number' && typeof b === 'string') return a === Number(b);
  if (typeof a === 'string' && typeof b === 'number') return Number(a) === b;
  return a === b;
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return String(a).localeCompare(String(b));
}
