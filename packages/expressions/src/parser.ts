import { tokenize, type Token } from "./tokenizer.js";
import type { BinaryOp, Expr, PathSegment } from "./ast.js";
import { ExpressionError } from "./errors.js";

/**
 * Recursive-descent parser for the expression language. Deliberately small:
 * no statements, no assignment, no loops, no arbitrary function definitions --
 * only the operators and shapes listed in the product spec. This, plus the
 * tree-walking evaluator (not eval/new Function), is what keeps expressions
 * safe to run against untrusted report authors.
 */
export class Parser {
  private tokens: Token[];
  private pos = 0;
  private source: string;

  constructor(source: string) {
    this.source = source;
    this.tokens = tokenize(source);
  }

  static parse(source: string): Expr {
    const parser = new Parser(source);
    const expr = parser.parseExpression();
    parser.expectEof();
    return expr;
  }

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private advance(): Token {
    return this.tokens[this.pos++]!;
  }

  private check(type: Token["type"], value?: string): boolean {
    const t = this.peek();
    return t.type === type && (value === undefined || t.value === value);
  }

  private match(type: Token["type"], value?: string): Token | undefined {
    if (this.check(type, value)) return this.advance();
    return undefined;
  }

  private expect(type: Token["type"], value?: string): Token {
    const t = this.match(type, value);
    if (!t) {
      const found = this.peek();
      throw new ExpressionError(
        `Expected ${value ?? type} but found "${found.value || "end of expression"}".`,
        { expression: this.source, position: found.position }
      );
    }
    return t;
  }

  private expectEof(): void {
    if (!this.check("eof")) {
      const t = this.peek();
      throw new ExpressionError(`Unexpected token "${t.value}".`, { expression: this.source, position: t.position });
    }
  }

  parseExpression(): Expr {
    return this.parseConditional();
  }

  private parseConditional(): Expr {
    const cond = this.parseNullish();
    if (this.match("punct", "?")) {
      const then = this.parseExpression();
      this.expect("punct", ":");
      const elseExpr = this.parseExpression();
      return { kind: "conditional", cond, then, else: elseExpr };
    }
    return cond;
  }

  private parseNullish(): Expr {
    let left = this.parseOr();
    while (this.check("punct", "??")) {
      this.advance();
      left = { kind: "binary", op: "??", left, right: this.parseOr() };
    }
    return left;
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.check("punct", "||")) {
      this.advance();
      left = { kind: "binary", op: "||", left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseEquality();
    while (this.check("punct", "&&")) {
      this.advance();
      left = { kind: "binary", op: "&&", left, right: this.parseEquality() };
    }
    return left;
  }

  private parseEquality(): Expr {
    let left = this.parseComparison();
    while (this.check("punct", "==") || this.check("punct", "!=")) {
      const op = this.advance().value as BinaryOp;
      left = { kind: "binary", op, left, right: this.parseComparison() };
    }
    return left;
  }

  private parseComparison(): Expr {
    let left = this.parseAdditive();
    while (
      this.check("punct", ">") ||
      this.check("punct", ">=") ||
      this.check("punct", "<") ||
      this.check("punct", "<=")
    ) {
      const op = this.advance().value as BinaryOp;
      left = { kind: "binary", op, left, right: this.parseAdditive() };
    }
    return left;
  }

  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    while (this.check("punct", "+") || this.check("punct", "-")) {
      const op = this.advance().value as BinaryOp;
      left = { kind: "binary", op, left, right: this.parseMultiplicative() };
    }
    return left;
  }

  private parseMultiplicative(): Expr {
    let left = this.parseUnary();
    while (this.check("punct", "*") || this.check("punct", "/") || this.check("punct", "%")) {
      const op = this.advance().value as BinaryOp;
      left = { kind: "binary", op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.check("punct", "!") || this.check("punct", "-")) {
      const op = this.advance().value as "!" | "-";
      return { kind: "unary", op, expr: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let expr = this.parsePrimary();

    // Function call: identifier immediately followed by '('.
    if (expr.kind === "path" && expr.segments.length === 1 && expr.segments[0]!.type === "prop" && this.check("punct", "(")) {
      const name = expr.segments[0]!.name;
      this.advance();
      const args: Expr[] = [];
      if (!this.check("punct", ")")) {
        args.push(this.parseExpression());
        while (this.match("punct", ",")) {
          args.push(this.parseExpression());
        }
      }
      this.expect("punct", ")");
      expr = { kind: "call", name, args };
    }

    while (this.check("punct", ".") || this.check("punct", "[")) {
      if (expr.kind !== "path") {
        // Allow chaining off a call result too, by promoting to a synthetic path wrapper.
        break;
      }
      if (this.match("punct", ".")) {
        const name = this.expect("identifier").value;
        expr = { kind: "path", segments: [...expr.segments, { type: "prop", name }] };
      } else if (this.match("punct", "[")) {
        const indexExpr = this.parseExpression();
        this.expect("punct", "]");
        expr = { kind: "path", segments: [...expr.segments, { type: "index", expr: indexExpr }] };
      }
    }
    return expr;
  }

  private parsePrimary(): Expr {
    const t = this.peek();

    if (t.type === "number") {
      this.advance();
      return { kind: "number", value: Number(t.value) };
    }
    if (t.type === "string") {
      this.advance();
      return { kind: "string", value: t.value };
    }
    if (t.type === "boolean") {
      this.advance();
      return { kind: "boolean", value: t.value === "true" };
    }
    if (t.type === "null") {
      this.advance();
      return { kind: "null" };
    }
    if (t.type === "identifier") {
      this.advance();
      const segments: PathSegment[] = [{ type: "prop", name: t.value }];
      return { kind: "path", segments };
    }
    if (this.match("punct", "(")) {
      const expr = this.parseExpression();
      this.expect("punct", ")");
      return expr;
    }

    throw new ExpressionError(`Unexpected token "${t.value || "end of expression"}".`, {
      expression: this.source,
      position: t.position,
    });
  }
}
