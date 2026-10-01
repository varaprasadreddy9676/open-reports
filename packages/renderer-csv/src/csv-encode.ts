/** RFC 4180-style field escaping: a field containing the delimiter, a quote,
 * or a newline is wrapped in quotes, with embedded quotes doubled. */
export function escapeCsvField(value: unknown, delimiter: string): string {
  let str = value === null || value === undefined ? "" : String(value);
  // Spreadsheet formula injection (OWASP): a text cell starting with = + - @ (or tab/CR) would be executed by Excel/Sheets. Real numbers are untouched.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(str) && !/^-?\d+(\.\d+)?$/.test(str)) str = `'${str}`;
  if (str.includes(delimiter) || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function encodeCsvRow(fields: unknown[], delimiter: string): string {
  return fields.map((f) => escapeCsvField(f, delimiter)).join(delimiter);
}
