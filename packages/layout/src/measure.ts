/**
 * Renderers that have real font metrics (PDFKit, a browser) should supply
 * their own TextMeasurer. This default is a heuristic (average glyph width
 * per point size) good enough for pagination estimates in tests and for any
 * renderer that doesn't care about pixel-perfect wrapping -- it is never
 * used to decide what text actually looks like, only how many lines/how
 * tall a block is likely to be.
 */
export interface TextStyleHint {
  family?: string;
  bold?: boolean;
  italic?: boolean;
  /** CSS-style line-height multiplier, when explicitly set by the report. */
  lineHeight?: number;
}

export interface TextMeasurer {
  widthOf(text: string, fontSize: number, hint?: TextStyleHint): number;
  lineHeight(fontSize: number, hint?: TextStyleHint): number;
}

const AVG_CHAR_WIDTH_RATIO = 0.52;

export const defaultTextMeasurer: TextMeasurer = {
  widthOf(text: string, fontSize: number, hint?: TextStyleHint): number {
    return text.length * fontSize * AVG_CHAR_WIDTH_RATIO * (hint?.bold ? 1.06 : 1);
  },
  lineHeight(fontSize: number, hint?: TextStyleHint): number {
    return fontSize * (hint?.lineHeight && hint.lineHeight > 0 ? hint.lineHeight : 1.3);
  },
};

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Lines used for both measurement and page slicing. Explicit newlines are
 * preserved; overlong words are broken at Unicode grapheme boundaries. */
export function wrapTextLines(text: string, maxWidth: number, fontSize: number, measurer: TextMeasurer, hint?: TextStyleHint): string[] {
  const fits = (value: string) => measurer.widthOf(value, fontSize, hint) <= maxWidth;
  const lines: string[] = [];
  for (const paragraph of text.split(/\r\n|\r|\n/)) {
    if (!paragraph) { lines.push(""); continue; }
    let line = "";
    for (const word of paragraph.match(/\S+|\s+/gu) ?? []) {
      if (/^\s+$/u.test(word)) {
        if (line) line += word;
        continue;
      }
      const candidate = line + word;
      if (line && !fits(candidate)) {
        lines.push(line.trimEnd());
        line = "";
      }
      if (fits(word)) { line += word; continue; }
      for (const { segment: character } of graphemes.segment(word)) {
        if (line && !fits(line + character)) {
          lines.push(line.trimEnd());
          line = "";
        }
        line += character;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export function wrapLineCount(text: string, maxWidth: number, fontSize: number, measurer: TextMeasurer, hint?: TextStyleHint): number {
  return wrapTextLines(text, maxWidth, fontSize, measurer, hint).length;
}
