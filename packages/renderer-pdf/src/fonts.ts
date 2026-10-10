import fs from "node:fs";
import path from "node:path";

export interface FontVariant {
  regular: string;
  bold?: string;
  italic?: string;
  boldItalic?: string;
}

export type Script = "latin" | "devanagari" | "telugu" | "kannada" | "tamil" | "arabic";

export interface FontOptions {
  /** Logical family name -> font files. Each file is embedded by pdfkit, giving real Unicode, shaped, searchable text. */
  families?: Record<string, FontVariant>;
  /** Family used when a component doesn't name one (or names an unregistered one). */
  defaultFamily?: string;
  /** Which family to use for each non-Latin script (the fallback chain: script family -> default family -> standard font). */
  scriptFamilies?: Partial<Record<Script, string>>;
}

const STANDARD: FontVariant = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
  italic: "Helvetica-Oblique",
  boldItalic: "Helvetica-BoldOblique",
};

export function detectScript(ch: string): Script | undefined {
  const c = ch.codePointAt(0)!;
  if (c >= 0x0900 && c <= 0x097f) return "devanagari";
  if (c >= 0x0b80 && c <= 0x0bff) return "tamil";
  if (c >= 0x0c00 && c <= 0x0c7f) return "telugu";
  if (c >= 0x0c80 && c <= 0x0cff) return "kannada";
  if ((c >= 0x0600 && c <= 0x06ff) || (c >= 0x0750 && c <= 0x077f) || (c >= 0xfb50 && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfeff)) return "arabic";
  if (c > 0x2e && /\p{L}/u.test(ch)) return "latin";
  return undefined; // spaces, digits, punctuation: join the surrounding run
}

/** Splits text into runs of a single script so each run can use a font that has its glyphs.
 * Neutral characters (spaces, digits, punctuation) stay with the run before them. */
export function splitRuns(text: string): { text: string; script: Script }[] {
  const runs: { text: string; script: Script }[] = [];
  let leading = "";
  for (const ch of text) {
    const script = detectScript(ch);
    const last = runs[runs.length - 1];
    if (!script) {
      if (last) last.text += ch;
      else leading += ch;
    } else if (last && last.script === script) {
      last.text += ch;
    } else {
      runs.push({ text: leading + ch, script });
      leading = "";
    }
  }
  if (!runs.length && leading) runs.push({ text: leading, script: "latin" });
  return runs;
}

const NOTO_DIRS = ["/usr/share/fonts/truetype/noto", "/usr/share/fonts/noto", "/usr/share/fonts/opentype/noto", "/usr/local/share/fonts/noto"];

function variant(dir: string, base: string): FontVariant | undefined {
  const f = (suffix: string) => {
    const p = path.join(dir, `${base}-${suffix}.ttf`);
    return fs.existsSync(p) ? p : undefined;
  };
  const regular = f("Regular");
  if (!regular) return undefined;
  return { regular, bold: f("Bold"), italic: f("Italic"), boldItalic: f("BoldItalic") };
}

/** Finds the Noto font family files on this machine (override the search path with FONTS_DIR). */
export function discoverFonts(extraDirs: string[] = []): FontOptions {
  const dirs = [...(process.env.FONTS_DIR ? [process.env.FONTS_DIR] : []), ...extraDirs, ...NOTO_DIRS];
  const families: Record<string, FontVariant> = {};
  const scriptFamilies: Partial<Record<Script, string>> = {};
  const wanted: [string, string, Script | undefined][] = [
    ["Noto Sans", "NotoSans", undefined],
    ["Noto Sans Devanagari", "NotoSansDevanagari", "devanagari"],
    ["Noto Sans Telugu", "NotoSansTelugu", "telugu"],
    ["Noto Sans Kannada", "NotoSansKannada", "kannada"],
    ["Noto Sans Tamil", "NotoSansTamil", "tamil"],
    ["Noto Sans Arabic", "NotoSansArabic", "arabic"],
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const [name, base, script] of wanted) {
      if (families[name]) continue;
      const v = variant(dir, base);
      if (v) {
        families[name] = v;
        if (script) scriptFamilies[script] = name;
      }
    }
  }
  return { families, scriptFamilies, defaultFamily: families["Noto Sans"] ? "Noto Sans" : undefined };
}

/** Resolves {family, weight, style, script} to an embedded font, embedding each file at most once per document. */
export class PdfFontRegistry {
  private registered = new Set<string>();
  private families: Record<string, FontVariant>;
  private lower = new Map<string, string>();

  constructor(
    private doc: PDFKit.PDFDocument,
    private options: FontOptions = {}
  ) {
    this.families = options.families ?? {};
    for (const k of Object.keys(this.families)) this.lower.set(k.toLowerCase(), k);
  }

  private pick(family: string | undefined, script: Script): string | undefined {
    if (script !== "latin") {
      const sf = this.options.scriptFamilies?.[script];
      if (sf && this.families[sf]) return sf;
    }
    if (family) {
      const exact = this.lower.get(family.toLowerCase());
      if (exact) return exact;
    }
    return undefined;
  }

  resolve(familyName: string | undefined, bold: boolean, italic: boolean, script: Script = "latin", pdfFontFace?: string): string {
    if (pdfFontFace) {
      const mappedFamily = this.lower.get(pdfFontFace.toLowerCase());
      if (mappedFamily) return this.registeredFamily(mappedFamily, false, false);
      const exactPdfFace = script === "latin" ? standardPdfFont(pdfFontFace, false, false, true) : undefined;
      if (exactPdfFace) return exactPdfFace;
    }
    const family = this.pick(familyName, script);
    if (family) {
      return this.registeredFamily(family, bold, italic);
    }
    const pdfStandard = script === "latin" ? standardPdfFont(familyName, bold, italic) : undefined;
    if (pdfStandard) return pdfStandard;
    const fallback = this.options.defaultFamily && this.families[this.options.defaultFamily] ? this.options.defaultFamily : undefined;
    if (!fallback) return standard(bold, italic);
    const v = this.families[fallback]!;
    const file = bold && italic ? v.boldItalic ?? v.bold ?? v.regular : bold ? v.bold ?? v.regular : italic ? v.italic ?? v.regular : v.regular;
    const key = `${fallback}:${file}`;
    if (!this.registered.has(key)) {
      if (!fs.existsSync(file)) return standard(bold, italic);
      this.doc.registerFont(key, file);
      this.registered.add(key);
    }
    return key;
  }

  private registeredFamily(family: string, bold: boolean, italic: boolean): string {
    const v = this.families[family]!;
    const file = bold && italic ? v.boldItalic ?? v.bold ?? v.regular : bold ? v.bold ?? v.regular : italic ? v.italic ?? v.regular : v.regular;
    const key = `${family}:${file}`;
    if (!this.registered.has(key)) {
      if (!fs.existsSync(file)) return standard(bold, italic);
      this.doc.registerFont(key, file);
      this.registered.add(key);
    }
    return key;
  }

  /** Text split into per-script runs, each with the font that can draw it. */
  runs(text: string, familyName: string | undefined, bold: boolean, italic: boolean, pdfFontFace?: string): { text: string; font: string }[] {
    return splitRuns(text).map((r) => ({ text: r.text, font: this.resolve(familyName, bold, italic, r.script, pdfFontFace) }));
  }
}

function standard(bold: boolean, italic: boolean): string {
  if (bold && italic) return STANDARD.boldItalic!;
  if (bold) return STANDARD.bold!;
  if (italic) return STANDARD.italic!;
  return STANDARD.regular;
}

/** Resolve PDF base-14 families preserved by JRXML's pdfFontName attribute. */
function standardPdfFont(familyName: string | undefined, bold: boolean, italic: boolean, exact = false): string | undefined {
  const family = familyName?.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (!family) return undefined;
  const face = family.match(/^(helvetica|times(?:-roman)?|courier)(?:-(bold(?:-italic)?|italic|oblique|boldoblique))?$/);
  if (!face) return undefined;
  const base = face[1] === "times" || face[1] === "times-roman" ? "Times" : face[1] === "courier" ? "Courier" : "Helvetica";
  const explicitStyle = face[2];
  const isBold = explicitStyle ? explicitStyle.startsWith("bold") : exact ? false : bold;
  const isItalic = explicitStyle ? explicitStyle.includes("italic") || explicitStyle.includes("oblique") : exact ? false : italic;
  if (base === "Times") return isBold && isItalic ? "Times-BoldItalic" : isBold ? "Times-Bold" : isItalic ? "Times-Italic" : "Times-Roman";
  if (base === "Courier") return isBold && isItalic ? "Courier-BoldOblique" : isBold ? "Courier-Bold" : isItalic ? "Courier-Oblique" : "Courier";
  return isBold && isItalic ? "Helvetica-BoldOblique" : isBold ? "Helvetica-Bold" : isItalic ? "Helvetica-Oblique" : "Helvetica";
}
