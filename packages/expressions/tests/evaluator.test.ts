import { describe, it, expect } from "vitest";
import { ExpressionEngine } from "../src/evaluator.js";
import { ExpressionError } from "../src/errors.js";
import { formatDate } from "../src/functions.js";

const engine = new ExpressionEngine({ locale: "en-US", currency: "USD" });

describe("arithmetic", () => {
  it("evaluates basic arithmetic with precedence", () => {
    expect(engine.evaluate("2 + 3 * 4", {})).toBe(14);
    expect(engine.evaluate("(2 + 3) * 4", {})).toBe(20);
    expect(engine.evaluate("10 % 3", {})).toBe(1);
  });

  it("evaluates with row bindings", () => {
    expect(engine.evaluate("row.quantity * row.price", { row: { quantity: 2, price: 500 } })).toBe(1000);
  });
});

describe("boolean expressions", () => {
  it("handles comparisons and logical ops", () => {
    expect(engine.evaluate("row.balance > 0 && row.active", { row: { balance: 10, active: true } })).toBe(true);
    expect(engine.evaluate("row.balance < 0 || row.flagged", { row: { balance: 10, flagged: false } })).toBe(false);
    expect(engine.evaluate("!row.active", { row: { active: true } })).toBe(false);
  });

  it("supports ternary and nullish coalescing", () => {
    expect(engine.evaluate('row.balance > 0 ? "positive" : "negative"', { row: { balance: -5 } })).toBe("negative");
    expect(engine.evaluate("row.nickname ?? row.name", { row: { name: "Bob", nickname: null } })).toBe("Bob");
  });
});

describe("null handling", () => {
  it("treats missing nested values as undefined rather than throwing", () => {
    expect(engine.evaluate("row.address.city", { row: { address: null } })).toBeUndefined();
  });
});

describe("string functions", () => {
  it("supports upper/lower/trim/concat/contains", () => {
    expect(engine.evaluate('upper(row.name)', { row: { name: "bob" } })).toBe("BOB");
    expect(engine.evaluate('lower("ABC")', {})).toBe("abc");
    expect(engine.evaluate('trim("  hi  ")', {})).toBe("hi");
    expect(engine.evaluate('concat("a", "b", "c")', {})).toBe("abc");
    expect(engine.evaluate('contains(row.name, "ob")', { row: { name: "bob" } })).toBe(true);
  });
});

describe("date functions", () => {
  it("formats and adds days", () => {
    expect(engine.evaluate('formatDate(row.date, "yyyy-MM-dd")', { row: { date: "2024-01-15T00:00:00Z" } })).toBe(
      "2024-01-15"
    );
  });

  it("computes differences", () => {
    const result = engine.evaluate('difference(row.b, row.a, "days")', {
      row: { a: "2024-01-01", b: "2024-01-05" },
    });
    expect(result).toBe(4);
  });
});

describe("currency/format functions", () => {
  it("formats currency", () => {
    expect(engine.evaluate("formatCurrency(1000)", {})).toBe("$1,000.00");
  });
});

describe("aggregate functions", () => {
  it("sums/avgs/counts an array", () => {
    const data = { items: [{ amount: 10 }, { amount: 20 }, { amount: 30 }] };
    expect(engine.evaluate("sum(data.items[0].amount)", { data: { items: [{ amount: 5 }] } })).toBe(5);
    const amounts = [10, 20, 30];
    expect(engine.evaluate("sum(row.amounts)", { row: { amounts } })).toBe(60);
    expect(engine.evaluate("avg(row.amounts)", { row: { amounts } })).toBe(20);
    expect(engine.evaluate("count(row.amounts)", { row: { amounts } })).toBe(3);
    expect(engine.evaluate("max(row.amounts)", { row: { amounts } })).toBe(30);
    void data;
  });
});

describe("invalid fields and malformed expressions", () => {
  it("throws a descriptive error with a suggestion for a typo'd field", () => {
    expect(() => engine.evaluate("formatCurrency(row.prcie)", { row: { price: 10 } })).toThrowError(
      /Unknown field "row.prcie"/
    );
    try {
      engine.evaluate("formatCurrency(row.prcie)", { row: { price: 10 } });
    } catch (err) {
      expect(err).toBeInstanceOf(ExpressionError);
      expect((err as Error).message).toContain('Did you mean "row.price"?');
    }
  });

  it("throws on unknown function with a suggestion", () => {
    expect(() => engine.evaluate("uppr(row.name)", { row: { name: "x" } })).toThrowError(/Unknown function "uppr"/);
  });

  it("throws on malformed syntax", () => {
    expect(() => engine.evaluate("1 +", {})).toThrow();
    expect(() => engine.evaluate("((1 + 2)", {})).toThrow();
  });
});

describe("security: no arbitrary JavaScript execution", () => {
  it("never invokes eval or Function under the hood", () => {
    const originalEval = global.eval;
    const originalFunction = global.Function;
    let evalCalled = false;
    let functionCalled = false;
    // @ts-expect-error intentional monkeypatch for test assertion
    global.eval = (...args: unknown[]) => {
      evalCalled = true;
      return originalEval(...(args as [string]));
    };
    // @ts-expect-error intentional monkeypatch for test assertion
    global.Function = function (...args: unknown[]) {
      functionCalled = true;
      // @ts-expect-error constructing dynamically for the spy
      return new originalFunction(...args);
    };

    try {
      engine.evaluate("row.a + row.b * (row.c - 1)", { row: { a: 1, b: 2, c: 3 } });
    } finally {
      global.eval = originalEval;
      global.Function = originalFunction;
    }

    expect(evalCalled).toBe(false);
    expect(functionCalled).toBe(false);
  });

  it("blocks access to __proto__/constructor/prototype even as path segments", () => {
    expect(() => engine.evaluate("row.constructor", { row: { x: 1 } })).toThrow(/not allowed/);
    expect(() => engine.evaluate("row.__proto__", { row: { x: 1 } })).toThrow(/not allowed/);
    expect(() => engine.evaluate("row.a.prototype", { row: { a: {} } })).toThrow(/not allowed/);
  });

  it("cannot escape the sandbox via a crafted string expression", () => {
    // Even if a malicious author tries to smuggle JS as a string, it is treated as inert data.
    const result = engine.evaluate('row.payload', { row: { payload: "process.exit(1)" } });
    expect(result).toBe("process.exit(1)");
  });

  it("rejects unknown top-level context fields instead of reaching into globals", () => {
    expect(() => engine.evaluate("process.env", {})).toThrow(/Unknown field "process"/);
    expect(() => engine.evaluate("global.process", {})).toThrow(/Unknown field "global"/);
  });
});

describe("sumProduct", () => {
  it("sums the product of two fields across rows", () => {
    expect(engine.evaluate('sumProduct(row.items, "q", "p")', { row: { items: [{ q: 2, p: 5 }, { q: 3, p: 10 }] } })).toBe(40);
  });
});

describe("formatDate month names", () => {
  it("supports MMM and MMMM", () => {
    expect(engine.evaluate('formatDate(row.d, "dd MMM yyyy")', { row: { d: "2025-01-15T12:00:00Z" } })).toBe("15 Jan 2025");
    expect(engine.evaluate('formatDate(row.d, "MMMM yyyy")', { row: { d: "2025-03-15T12:00:00Z" } })).toBe("March 2025");
  });
});

describe("formatDate time zones", () => {
  it("formats in the engine's time zone when one is set", () => {
    const kolkata = new ExpressionEngine({ timeZone: "Asia/Kolkata" });
    const newYork = new ExpressionEngine({ timeZone: "America/New_York" });
    const row = { d: "2025-01-15T22:30:00Z" };
    expect(kolkata.evaluate('formatDate(row.d, "yyyy-MM-dd HH:mm")', { row })).toBe("2025-01-16 04:00");
    expect(newYork.evaluate('formatDate(row.d, "yyyy-MM-dd HH:mm")', { row })).toBe("2025-01-15 17:30");
    expect(newYork.evaluate('formatDate(row.d, "MMMM")', { row: { d: "2025-02-01T02:00:00Z" } })).toBe("January");
  });
  it("formats midnight as 00 in 24-hour patterns", () => {
    expect(formatDate(new Date("2025-06-01T00:00:00Z"), "HH:mm:ss", "en-US", "UTC")).toBe("00:00:00");
  });
});
