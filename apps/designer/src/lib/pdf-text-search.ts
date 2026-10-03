export interface TextSegment {
  item: number;
  start: number;
  end: number;
}

export interface PageTextMatch {
  excerpt: string;
  segments: TextSegment[];
}

/** Find one literal phrase even when PDF.js divides it between text items. */
export function findPageTextMatch(items: string[], query: string): PageTextMatch | undefined {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return;
  const visible = items.map((value, item) => ({ value, item })).filter(({ value }) => value.trim().length > 0);
  for (const separator of [" ", ""]) {
    const text = visible.map(({ value }) => value).join(separator);
    const at = text.toLocaleLowerCase().indexOf(needle);
    if (at < 0) continue;
    const segments: TextSegment[] = [];
    let offset = 0;
    for (const { value, item } of visible) {
      const length = value.length;
      const start = Math.max(0, at - offset);
      const end = Math.min(length, at + needle.length - offset);
      if (end > start) segments.push({ item, start, end });
      offset += length + separator.length;
    }
    if (!segments.length) continue;
    return { excerpt: text.slice(Math.max(0, at - 36), Math.min(text.length, at + needle.length + 36)), segments };
  }
}
