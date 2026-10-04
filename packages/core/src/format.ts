import { formatDate } from "@reporting/expressions";

export interface FormatOptions {
  locale: string;
  currency: string;
  /** IANA time zone for dates; the host's local time when omitted. */
  timeZone?: string;
}

/** Applies a named/parameterized format string to a resolved value.
 * Supported: "currency", "number", "number:2", "percent", "date", "date:yyyy-MM-dd". */
export function formatValue(value: unknown, format: string | undefined, options: FormatOptions): string {
  if (format === undefined) return stringify(value);
  // Split at the first colon only: date patterns such as "HH:mm" contain colons.
  const colon = format.indexOf(":");
  const kind = colon < 0 ? format : format.slice(0, colon);
  const arg = colon < 0 ? undefined : format.slice(colon + 1);

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
      return formatDate(d, arg ?? "yyyy-MM-dd", options.locale, options.timeZone);
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

