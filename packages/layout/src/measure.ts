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

export function wrapLineCount(text: string, maxWidth: number, fontSize: number, measurer: TextMeasurer, hint?: TextStyleHint): number {
  if (!text) return 1;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;

  let lines = 1;
  let currentWidth = 0;
  const spaceWidth = measurer.widthOf(" ", fontSize, hint);

  for (const word of words) {
    const wordWidth = measurer.widthOf(word, fontSize, hint);
    if (currentWidth > 0 && currentWidth + spaceWidth + wordWidth > maxWidth) {
      lines++;
      currentWidth = wordWidth;
    } else {
      currentWidth += (currentWidth > 0 ? spaceWidth : 0) + wordWidth;
    }
  }
  return lines;
}
