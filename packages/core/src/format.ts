export interface FormatOptions {
  locale: string;
  currency: string;
}

/** Applies a named/parameterized format string to a resolved value.
 * Supported: "currency", "number", "number:2", "percent", "date", "date:yyyy-MM-dd". */
export function formatValue(value: unknown, format: string | undefined, options: FormatOptions): string {
  if (format === undefined) return stringify(value);
  const [kind, arg] = format.split(":");

  switch (kind) {
    case "currency":
      return new Intl.NumberFormat(options.locale, { style: "currency", currency: arg ?? options.currency }).format(
        toNumber(value)
      );
    case "number":
      return new Intl.NumberFormat(options.locale, {
        minimumFractionDigits: arg ? Number(arg) : undefined,
        maximumFractionDigits: arg ? Number(arg) : undefined,
      }).format(toNumber(value));
    case "percent":
      return new Intl.NumberFormat(options.locale, { style: "percent" }).format(toNumber(value));
    case "date": {
      const d = value instanceof Date ? value : new Date(value as string);
      return formatDatePattern(d, arg ?? "yyyy-MM-dd", options.locale);
    }
    default:
      return stringify(value);
  }
}

function toNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function formatDatePattern(date: Date, pattern: string, locale = "en-US"): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const month = (style: "long" | "short") => new Intl.DateTimeFormat(locale, { month: style, timeZone: "UTC" }).format(new Date(Date.UTC(2000, date.getMonth(), 1)));
  const map: Record<string, () => string> = {
    yyyy: () => String(date.getFullYear()),
    MMMM: () => month("long"),
    MMM: () => month("short"),
    MM: () => pad(date.getMonth() + 1),
    dd: () => pad(date.getDate()),
    HH: () => pad(date.getHours()),
    mm: () => pad(date.getMinutes()),
    ss: () => pad(date.getSeconds()),
  };
  return pattern.replace(/yyyy|MMMM|MMM|MM|dd|HH|mm|ss/g, (t) => map[t]?.() ?? t);
}
