/** Maps a column's report-level `format` string ("currency", "number:2",
 * "date:yyyy-MM-dd", ...) to an Excel number-format string, so cells carry
 * real numeric/date types with native Excel formatting rather than a
 * pre-formatted display string. */
export function excelNumberFormat(format: string | undefined): string | undefined {
  if (!format) return undefined;
  const [kind, arg] = format.split(":");
  switch (kind) {
    case "currency":
      return '"$"#,##0.00';
    case "number":
      return arg ? `#,##0.${"0".repeat(Number(arg))}` : "#,##0.00";
    case "percent":
      return "0.00%";
    case "date":
      return "yyyy-mm-dd";
    default:
      return undefined;
  }
}
