/**
 * Renderers that have real font metrics (PDFKit, a browser) should supply
 * their own TextMeasurer. This default is a heuristic (average glyph width
 * per point size) good enough for pagination estimates in tests and for any
 * renderer that doesn't care about pixel-perfect wrapping -- it is never
 * used to decide what text actually looks like, only how many lines/how
 * tall a block is likely to be.
 */
export interface TextMeasurer {
  widthOf(text: string, fontSize: number, fontFamily?: string): number;
  lineHeight(fontSize: number): number;
}

const AVG_CHAR_WIDTH_RATIO = 0.52;

export const defaultTextMeasurer: TextMeasurer = {
  widthOf(text: string, fontSize: number): number {
    return text.length * fontSize * AVG_CHAR_WIDTH_RATIO;
  },
  lineHeight(fontSize: number): number {
    return fontSize * 1.3;
  },
};

export function wrapLineCount(text: string, maxWidth: number, fontSize: number, measurer: TextMeasurer): number {
  if (!text) return 1;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;

  let lines = 1;
  let currentWidth = 0;
  const spaceWidth = measurer.widthOf(" ", fontSize);

  for (const word of words) {
    const wordWidth = measurer.widthOf(word, fontSize);
    if (currentWidth > 0 && currentWidth + spaceWidth + wordWidth > maxWidth) {
      lines++;
      currentWidth = wordWidth;
    } else {
      currentWidth += (currentWidth > 0 ? spaceWidth : 0) + wordWidth;
    }
  }
  return lines;
}
