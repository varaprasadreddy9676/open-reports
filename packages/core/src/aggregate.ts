export type AggregateFn = "sum" | "avg" | "min" | "max" | "count" | "first" | "last";

export function aggregate(fn: AggregateFn, values: unknown[]): unknown {
  const numeric = () => values.map((v) => (typeof v === "number" ? v : Number(v) || 0));
  switch (fn) {
    case "sum":
      return numeric().reduce((a, b) => a + b, 0);
    case "avg":
      return values.length === 0 ? 0 : numeric().reduce((a, b) => a + b, 0) / values.length;
    case "min":
      return Math.min(...numeric());
    case "max":
      return Math.max(...numeric());
    case "count":
      return values.length;
    case "first":
      return values[0];
    case "last":
      return values[values.length - 1];
  }
}
