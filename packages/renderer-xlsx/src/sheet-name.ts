const INVALID_CHARS = /[[\]:*?/\\]/g;

/** Excel worksheet names: max 31 chars, no `[ ] : * ? / \`, must be unique
 * within the workbook (callers pass an `index` to disambiguate duplicates). */
export function sanitizeSheetName(name: string, index: number, used: Set<string>): string {
  let base = (name || `Sheet${index + 1}`).replace(INVALID_CHARS, " ").trim().slice(0, 31) || `Sheet${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base.slice(0, 31 - String(suffix).length - 1)} ${suffix}`;
    suffix++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}
