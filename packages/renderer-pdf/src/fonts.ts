import fs from "node:fs";

export interface FontVariant {
  regular: string;
  bold?: string;
  italic?: string;
  boldItalic?: string;
}

export interface FontOptions {
  /** Logical family name -> font file paths, e.g. { body: { regular: "/fonts/NotoSans-Regular.ttf", bold: "..." } }.
   * Each file is embedded into the PDF by pdfkit, giving real Unicode/searchable text
   * (unlike the 14 standard PDF fonts, which are ASCII-only and not embedded). */
  families?: Record<string, FontVariant>;
  /** Family name to fall back to when a component's style.fontFamily isn't registered. */
  defaultFamily?: string;
}

const STANDARD_FALLBACK: FontVariant = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
  italic: "Helvetica-Oblique",
  boldItalic: "Helvetica-BoldOblique",
};

/** Resolves {family, bold, italic} style flags to a concrete, already-registered
 * PDFKit font name, embedding each file at most once per document. */
export class PdfFontRegistry {
  private registered = new Set<string>();
  private families: Record<string, FontVariant>;
  private defaultFamily: string | undefined;

  constructor(
    private doc: PDFKit.PDFDocument,
    options: FontOptions = {}
  ) {
    this.families = options.families ?? {};
    this.defaultFamily = options.defaultFamily;
  }

  resolve(familyName: string | undefined, bold: boolean, italic: boolean): string {
    const family = (familyName && this.families[familyName]) ?? (this.defaultFamily ? this.families[this.defaultFamily] : undefined);
    if (!family) {
      return pickStandard(bold, italic);
    }

    const path = bold && italic ? family.boldItalic ?? family.bold ?? family.regular : bold ? family.bold ?? family.regular : italic ? family.italic ?? family.regular : family.regular;

    const registeredName = `${familyName ?? this.defaultFamily}:${bold ? "b" : ""}${italic ? "i" : ""}`;
    if (!this.registered.has(registeredName)) {
      if (!fs.existsSync(path)) return pickStandard(bold, italic);
      this.doc.registerFont(registeredName, path);
      this.registered.add(registeredName);
    }
    return registeredName;
  }
}

function pickStandard(bold: boolean, italic: boolean): string {
  if (bold && italic) return STANDARD_FALLBACK.boldItalic!;
  if (bold) return STANDARD_FALLBACK.bold!;
  if (italic) return STANDARD_FALLBACK.italic!;
  return STANDARD_FALLBACK.regular;
}
