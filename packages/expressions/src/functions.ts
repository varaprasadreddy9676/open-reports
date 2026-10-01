export type ExpressionFunction = (...args: unknown[]) => unknown;

function toNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function toStr(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  const d = new Date(v as string | number);
  return d;
}

function toArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined) return [];
  return [v];
}

export const stringFunctions: Record<string, ExpressionFunction> = {
  upper: (v) => toStr(v).toUpperCase(),
  lower: (v) => toStr(v).toLowerCase(),
  trim: (v) => toStr(v).trim(),
  concat: (...args) => args.map(toStr).join(""),
  substring: (v, start, end) => toStr(v).substring(toNumber(start), end === undefined ? undefined : toNumber(end)),
  replace: (v, search, replacement) => toStr(v).split(toStr(search)).join(toStr(replacement)),
  contains: (v, search) => toStr(v).includes(toStr(search)),
  startsWith: (v, search) => toStr(v).startsWith(toStr(search)),
  endsWith: (v, search) => toStr(v).endsWith(toStr(search)),
};

export const numberFunctions: Record<string, ExpressionFunction> = {
  round: (v, digits) => {
    const factor = Math.pow(10, digits === undefined ? 0 : toNumber(digits));
    return Math.round(toNumber(v) * factor) / factor;
  },
  ceil: (v) => Math.ceil(toNumber(v)),
  floor: (v) => Math.floor(toNumber(v)),
  abs: (v) => Math.abs(toNumber(v)),
  min: (...args) => Math.min(...args.map(toNumber)),
  max: (...args) => Math.max(...args.map(toNumber)),
};

export const dateFunctions: Record<string, ExpressionFunction> = {
  now: () => new Date(),
  formatDate: (v, pattern) => formatDate(toDate(v), toStr(pattern ?? "yyyy-MM-dd")),
  addDays: (v, days) => {
    const d = new Date(toDate(v).getTime());
    d.setDate(d.getDate() + toNumber(days));
    return d;
  },
  difference: (a, b, unit) => {
    const ms = toDate(a).getTime() - toDate(b).getTime();
    switch (toStr(unit || "days")) {
      case "ms":
        return ms;
      case "seconds":
        return ms / 1000;
      case "minutes":
        return ms / 60000;
      case "hours":
        return ms / 3600000;
      default:
        return ms / 86400000;
    }
  },
};

function formatDate(date: Date, pattern: string): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const map: Record<string, string> = {
    yyyy: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    dd: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
  };
  return pattern.replace(/yyyy|MM|dd|HH|mm|ss/g, (token) => map[token] ?? token);
}

export function createFormatFunctions(locale: string, currency: string): Record<string, ExpressionFunction> {
  return {
    formatCurrency: (v, cur) =>
      new Intl.NumberFormat(locale, { style: "currency", currency: toStr(cur || currency) }).format(toNumber(v)),
    formatNumber: (v, digits) =>
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: digits === undefined ? undefined : toNumber(digits),
        maximumFractionDigits: digits === undefined ? undefined : toNumber(digits),
      }).format(toNumber(v)),
    formatPercent: (v, digits) =>
      new Intl.NumberFormat(locale, {
        style: "percent",
        minimumFractionDigits: digits === undefined ? undefined : toNumber(digits),
        maximumFractionDigits: digits === undefined ? undefined : toNumber(digits),
      }).format(toNumber(v)),
  };
}

export const aggregationFunctions: Record<string, ExpressionFunction> = {
  sum: (arr) => toArray(arr).reduce<number>((acc, v) => acc + toNumber(v), 0),
  avg: (arr) => {
    const a = toArray(arr);
    return a.length === 0 ? 0 : a.reduce<number>((acc, v) => acc + toNumber(v), 0) / a.length;
  },
  min: (arr) => Math.min(...toArray(arr).map(toNumber)),
  max: (arr) => Math.max(...toArray(arr).map(toNumber)),
  count: (arr) => toArray(arr).length,
  first: (arr) => toArray(arr)[0],
  last: (arr) => toArray(arr)[toArray(arr).length - 1],
};

export function buildDefaultFunctions(options?: { locale?: string; currency?: string }): Record<string, ExpressionFunction> {
  return {
    ...stringFunctions,
    ...numberFunctions,
    ...dateFunctions,
    ...createFormatFunctions(options?.locale ?? "en-US", options?.currency ?? "USD"),
    ...aggregationFunctions,
  };
}
