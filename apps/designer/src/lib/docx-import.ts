import JSZip from "jszip";
import { reportDefinitionSchema, type ReportDefinition } from "@reporting/schema";

const MAX_FILE = 20_000_000;
const MAX_XML = 8_000_000;
const MAX_IMAGE = 5_000_000;
const MAX_COMPONENTS = 2_000;
const NS = "*";

type Component = Record<string, unknown>;
type Relation = { target: string; external: boolean };

export interface WordImportResult {
  report: ReportDefinition;
  warnings: string[];
  summary: { paragraphs: number; tables: number; images: number };
}

const children = (node: Element, name: string): Element[] => Array.from(node.children).filter((child) => child.localName === name);
const child = (node: Element, name: string): Element | undefined => children(node, name)[0];
const descendants = (node: Element, name: string): Element[] => Array.from(node.getElementsByTagNameNS(NS, name));
const attribute = (node: Element | undefined, name: string): string | undefined => node?.getAttribute(`w:${name}`) ?? node?.getAttribute(`r:${name}`) ?? node?.getAttribute(name) ?? undefined;
const enabled = (node: Element | undefined): boolean => Boolean(node && !["0", "false", "off"].includes((attribute(node, "val") ?? "true").toLowerCase()));
const millimetres = (twips: string | undefined): number | undefined => twips && Number.isFinite(Number(twips)) ? Math.round(Number(twips) * 25.4 / 1440 * 100) / 100 : undefined;

function xml(source: string, label: string): Document {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error(`${label} contains unsupported XML declarations.`);
  const document = new DOMParser().parseFromString(source, "application/xml");
  if (document.getElementsByTagName("parsererror").length) throw new Error(`${label} is not valid XML.`);
  return document;
}

function packagePath(part: string, target: string): string | undefined {
  if (/^[a-z][a-z\d+.-]*:/i.test(target)) return undefined;
  const path = target.startsWith("/") ? target.slice(1) : `${part.slice(0, part.lastIndexOf("/") + 1)}${target}`;
  const normalized: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "..") normalized.pop();
    else if (segment && segment !== ".") normalized.push(segment);
  }
  return normalized.join("/");
}

function zipEntry(zip: JSZip, path: string, limit: number) {
  const entry = zip.file(path);
  if (!entry) return undefined;
  const uncompressed = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
  if (uncompressed !== undefined && uncompressed > limit) throw new Error(`${path} exceeds the import size limit.`);
  return entry;
}

async function partXml(zip: JSZip, path: string, required = false): Promise<Document | undefined> {
  const entry = zipEntry(zip, path, MAX_XML);
  if (!entry) {
    if (required) throw new Error(`This Word file is missing ${path}.`);
    return undefined;
  }
  const source = await entry.async("string");
  if (source.length > MAX_XML) throw new Error(`${path} exceeds the import size limit.`);
  return xml(source, path);
}

async function relationships(zip: JSZip, part: string): Promise<Map<string, Relation>> {
  const filename = part.slice(part.lastIndexOf("/") + 1);
  const rels = await partXml(zip, `${part.slice(0, part.lastIndexOf("/") + 1)}_rels/${filename}.rels`);
  const map = new Map<string, Relation>();
  if (rels) for (const relation of descendants(rels.documentElement, "Relationship")) {
    const id = relation.getAttribute("Id");
    const target = relation.getAttribute("Target");
    if (id && target) map.set(id, { target, external: relation.getAttribute("TargetMode") === "External" });
  }
  return map;
}

function paragraphText(paragraph: Element): string {
  const out: string[] = [];
  const visit = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    if (element.localName === "t") { out.push(element.textContent ?? ""); return; }
    if (element.localName === "tab") { out.push("\t"); return; }
    if (element.localName === "br" && attribute(element, "type") !== "page") { out.push("\n"); return; }
    for (const next of Array.from(element.childNodes)) visit(next);
  };
  visit(paragraph);
  return out.join("");
}

function paragraphComponent(paragraph: Element): Component | undefined {
  const text = paragraphText(paragraph);
  if (!text.trim()) return undefined;
  const props = child(paragraph, "pPr");
  const styleId = attribute(props && child(props, "pStyle"), "val") ?? "";
  const heading = /^heading\s*([1-4])$/i.exec(styleId);
  const firstRun = child(paragraph, "r");
  const runProps = firstRun && child(firstRun, "rPr");
  const fontSizeValue = attribute(runProps && child(runProps, "sz"), "val");
  const fontSize = fontSizeValue && Number.isFinite(Number(fontSizeValue)) ? Number(fontSizeValue) / 2 : undefined;
  const color = attribute(runProps && child(runProps, "color"), "val");
  const alignValue = attribute(props && child(props, "jc"), "val");
  const style: Record<string, unknown> = {};
  if (heading || enabled(runProps && child(runProps, "b"))) style.fontWeight = "bold";
  if (enabled(runProps && child(runProps, "i"))) style.italic = true;
  if (fontSize && fontSize > 0) style.fontSize = fontSize;
  if (color && /^[0-9a-f]{6}$/i.test(color)) style.color = `#${color}`;
  const font = attribute(runProps && child(runProps, "rFonts"), "ascii");
  if (font) style.fontFamily = font;
  if (alignValue === "center" || alignValue === "right") style.align = alignValue;
  if (alignValue === "both") style.align = "justify";
  const component: Component = { type: "text", value: text, ...(Object.keys(style).length ? { style } : {}) };
  if (heading) { component.bookmark = true; component.bookmarkLevel = Number(heading[1]); component.keepWithNext = true; }
  if (enabled(props && child(props, "keepNext"))) component.keepWithNext = true;
  if (enabled(props && child(props, "pageBreakBefore"))) component.pageBreakBefore = true;
  return component;
}

function tableCells(table: Element): { values: string[]; spans: { column: number; colSpan: number; vertical?: string }[]; header: boolean }[] {
  return children(table, "tr").map((row) => {
    const values: string[] = [];
    const spans: { column: number; colSpan: number; vertical?: string }[] = [];
    for (const cell of children(row, "tc")) {
      const props = child(cell, "tcPr");
      const colSpan = Math.max(1, Number(attribute(props && child(props, "gridSpan"), "val") ?? 1) || 1);
      const vertical = props && child(props, "vMerge") ? attribute(child(props, "vMerge"), "val") ?? "continue" : undefined;
      const column = values.length;
      values.push(children(cell, "p").map(paragraphText).join("\n"));
      for (let index = 1; index < colSpan; index++) values.push("");
      spans.push({ column, colSpan, vertical });
    }
    return { values, spans, header: enabled(child(child(row, "trPr") ?? row, "tblHeader")) };
  });
}

function tableMerges(rows: ReturnType<typeof tableCells>, start: number, end: number) {
  const merges: { row: number; column: number; colSpan: number; rowSpan: number }[] = [];
  for (let row = start; row < end; row++) for (const cell of rows[row]?.spans ?? []) {
    if (cell.vertical === "continue") continue;
    let rowSpan = 1;
    if (cell.vertical === "restart") {
      for (let next = row + 1; next < end; next++) {
        const continuation = rows[next]?.spans.find((candidate) => candidate.column === cell.column && candidate.vertical === "continue");
        if (!continuation) break;
        rowSpan++;
      }
    }
    if (rowSpan > 1 || cell.colSpan > 1) merges.push({ row: row - start, column: cell.column, colSpan: cell.colSpan, rowSpan });
  }
  return merges;
}

/** Import a local Word document into an editable, flow-based report draft. */
export async function importDocx(file: File): Promise<WordImportResult> {
  if (!file.name.toLowerCase().endsWith(".docx")) throw new Error("Choose a .docx Word file.");
  if (file.size > MAX_FILE) throw new Error("Word file exceeds the 20 MB import limit.");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files);
  if (entries.length > 5_000 || entries.reduce((sum, entry) => sum + ((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0), 0) > 50_000_000) {
    throw new Error("This Word file is too large to import safely.");
  }
  const document = await partXml(zip, "word/document.xml", true);
  const body = document && child(document.documentElement, "body");
  if (!body) throw new Error("This Word file has no document body.");
  const warnings = new Set<string>();
  const summary = { paragraphs: 0, tables: 0, images: 0 };
  const datasets: ReportDefinition["datasets"] = [];
  const documentRels = await relationships(zip, "word/document.xml");
  let componentCount = 0;

  const readImage = async (blip: Element, part: string, rels: Map<string, Relation>): Promise<Component | undefined> => {
    const id = attribute(blip, "embed");
    const relation = id && rels.get(id);
    if (!relation || relation.external) { warnings.add("Linked Word images need to be added again in the designer."); return undefined; }
    const path = packagePath(part, relation.target);
    const kind = path?.split(".").pop()?.toLowerCase();
    const mime = kind === "png" ? "image/png" : kind === "jpg" || kind === "jpeg" ? "image/jpeg" : undefined;
    if (!path || !mime) { warnings.add("Some Word image formats cannot be embedded; use PNG or JPEG for those images."); return undefined; }
    const entry = zipEntry(zip, path, MAX_IMAGE);
    if (!entry) { warnings.add("An embedded Word image could not be found."); return undefined; }
    const base64 = await entry.async("base64");
    if (base64.length > MAX_IMAGE * 4 / 3 + 8) throw new Error("An embedded image exceeds the 5 MB import limit.");
    let drawing: Element | null = blip;
    while (drawing && drawing.localName !== "drawing") drawing = drawing.parentElement;
    const extent = drawing && descendants(drawing, "extent")[0];
    const width = Number(extent?.getAttribute("cx")) / 12700;
    const height = Number(extent?.getAttribute("cy")) / 12700;
    const alt = drawing && descendants(drawing, "docPr")[0];
    summary.images++;
    return { type: "image", src: `data:${mime};base64,${base64}`, ...(width > 0 && height > 0 ? { width: `${Math.round(width)}pt`, height: `${Math.round(height)}pt` } : {}), ...(alt?.getAttribute("descr") ? { alt: alt.getAttribute("descr") } : {}) };
  };

  const blocks = async (root: Element, part: string, rels: Map<string, Relation>): Promise<Component[]> => {
    const out: Component[] = [];
    for (const node of Array.from(root.children)) {
      if (componentCount > MAX_COMPONENTS) throw new Error("This Word file has too many elements to import.");
      if (node.localName === "p") {
        if (descendants(node, "numPr").length) warnings.add("Word list numbering was converted to plain paragraphs.");
        if (descendants(node, "instrText").length || descendants(node, "fldSimple").length) warnings.add("Review Word fields and page numbers; their dynamic behavior is not imported.");
        if (descendants(node, "hyperlink").length) warnings.add("Word hyperlinks were converted to plain text.");
        const text = paragraphComponent(node);
        if (text) { out.push(text); summary.paragraphs++; componentCount++; }
        for (const blip of descendants(node, "blip")) {
          const image = await readImage(blip, part, rels);
          if (image) { out.push(image); componentCount++; }
        }
        if (descendants(node, "br").some((br) => attribute(br, "type") === "page")) { out.push({ type: "pageBreak" }); componentCount++; }
      } else if (node.localName === "tbl") {
        const rows = tableCells(node);
        if (!rows.length) continue;
        if (descendants(node, "tbl").length) warnings.add("Nested Word tables need to be recreated manually.");
        if (descendants(node, "blip").length) warnings.add("Images inside Word table cells need to be added again.");
        const headerCount = rows.findIndex((row) => !row.header);
        const firstBody = headerCount < 0 ? rows.length : headerCount;
        const width = Math.max(1, ...rows.map((row) => row.values.length));
        const dataset = `wordTable${summary.tables + 1}`;
        const columns = Array.from({ length: width }, (_, index) => ({ id: `column${index + 1}`, header: firstBody ? rows[0]?.values[index] ?? "" : `Column ${index + 1}`, binding: `row.column${index + 1}` }));
        const data = rows.slice(firstBody).map((row) => Object.fromEntries(columns.map((column, index) => [column.id, row.values[index] ?? ""])));
        datasets.push({ id: dataset, source: "inline", query: { data } });
        const bodyMerges = tableMerges(rows, firstBody, rows.length);
        const headerMerges = tableMerges(rows, 0, firstBody);
        const headerRows = firstBody > 0 && (firstBody > 1 || headerMerges.length) ? rows.slice(0, firstBody).map((row, rowIndex) => row.spans
          .filter((cell) => cell.vertical !== "continue")
          .map((cell) => ({
            column: cell.column,
            text: row.values[cell.column] ?? "",
            colSpan: cell.colSpan,
            rowSpan: headerMerges.find((merge) => merge.row === rowIndex && merge.column === cell.column)?.rowSpan ?? 1,
          }))) : undefined;
        const table: Component = { type: "table", dataset, columns, showHeader: firstBody > 0, ...(headerRows ? { headerRows } : {}), ...(bodyMerges.length ? { cellSpans: bodyMerges } : {}) };
        if (rows.some((row) => row.spans.some((span) => span.vertical === "continue")) && !bodyMerges.length && !headerMerges.length) warnings.add("Some Word table merges could not be reconstructed.");
        out.push(table);
        summary.tables++; componentCount++;
      } else if (node.localName === "sdt") {
        const content = child(node, "sdtContent");
        if (content) out.push(...await blocks(content, part, rels));
      }
    }
    return out;
  };

  const sections: ReportDefinition["sections"] = [];
  const sectionProperties = descendants(body, "sectPr").at(-1);
  if (descendants(body, "sectPr").length > 1) warnings.add("Only the final Word section's page setup and headers were imported.");
  const size = sectionProperties && child(sectionProperties, "pgSz");
  const margins = sectionProperties && child(sectionProperties, "pgMar");
  const width = millimetres(attribute(size, "w"));
  const height = millimetres(attribute(size, "h"));
  const page: ReportDefinition["page"] = {
    size: width && height ? "custom" : "A4", ...(width && height ? { width, height } : {}),
    unit: "mm", orientation: attribute(size, "orient") === "landscape" || Boolean(width && height && width > height) ? "landscape" : "portrait",
    margin: { top: millimetres(attribute(margins, "top")) ?? 20, right: millimetres(attribute(margins, "right")) ?? 15, bottom: millimetres(attribute(margins, "bottom")) ?? 20, left: millimetres(attribute(margins, "left")) ?? 15 },
  };
  const settings = await partXml(zip, "word/settings.xml");
  const evenOdd = enabled(settings && descendants(settings.documentElement, "evenAndOddHeaders")[0]);
  const firstPage = enabled(sectionProperties && child(sectionProperties, "titlePg"));
  for (const [type, reference] of [["pageHeader", "headerReference"], ["pageFooter", "footerReference"]] as const) {
    for (const ref of sectionProperties ? children(sectionProperties, reference) : []) {
      const variant = attribute(ref, "type");
      if (variant === "first" && !firstPage || variant === "even" && !evenOdd) continue;
      const relation = documentRels.get(attribute(ref, "id") ?? "");
      const path = relation && !relation.external && packagePath("word/document.xml", relation.target);
      const part = path && await partXml(zip, path);
      if (!path || !part) { warnings.add("A Word header or footer could not be imported."); continue; }
      const content = await blocks(part.documentElement, path, await relationships(zip, path));
      sections.push({ type, appliesTo: variant === "first" ? "first" : variant === "even" ? "even" : "standard", children: content });
    }
  }
  sections.push({ type: "detail", children: await blocks(body, "word/document.xml", documentRels) });
  if (descendants(body, "chart").length) warnings.add("Word charts need to be recreated with the chart component.");
  if (descendants(body, "txbxContent").length) warnings.add("Floating text boxes and shapes need layout review.");
  if (descendants(body, "sdt").length) warnings.add("Word content controls were converted to static content.");
  if (descendants(body, "footnoteReference").length) warnings.add("Word footnotes need to be recreated manually.");
  if (!sections.some((section) => section.children.length)) throw new Error("This Word file has no supported content to import.");
  warnings.add("Review spacing, columns and page breaks; Word's layout is converted to report flow.");
  const baseName = file.name.replace(/\.docx$/i, "").trim() || "Imported Word report";
  const report = reportDefinitionSchema.parse({ schemaVersion: "1.0", id: `word-${Date.now().toString(36)}`, name: baseName, description: `Editable draft imported from ${file.name}`, datasets, page, sections });
  return { report, warnings: [...warnings], summary };
}
