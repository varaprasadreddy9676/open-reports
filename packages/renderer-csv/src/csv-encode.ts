/** RFC 4180-style field escaping: a field containing the delimiter, a quote,
 * or a newline is wrapped in quotes, with embedded quotes doubled. */
export function escapeCsvField(value: unknown, delimiter: string): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes(delimiter) || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function encodeCsvRow(fields: unknown[], delimiter: string): string {
  return fields.map((f) => escapeCsvField(f, delimiter)).join(delimiter);
}
