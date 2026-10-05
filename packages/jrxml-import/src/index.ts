import { SaxesParser } from "saxes";
import { Parser, type Expr } from "@reporting/expressions";
import { parseReportDefinition, type ReportDefinition } from "@reporting/schema";

export { finishJrxmlFolderImport, importJrxmlFolder, importJrxmlFolderFile } from "./folder.js";
export type { JrxmlFolderSource, JrxmlFolderEntry, JrxmlFolderResult } from "./folder.js";

export type MigrationStatus = "converted" | "needs-review" | "unsupported";
export type MigrationIssue = {
  status: MigrationStatus;
  feature: string;
  source: string;
  line: number;
  message: string;
  targetId?: string;
  original?: string;
};
export type ImportResult = {
  report?: ReportDefinition;
  format?: "v6-style" | "v7-style";
  issues: MigrationIssue[];
  summary: Record<MigrationStatus, number>;
};

type XmlNode = { name: string; attrs: Record<string, string>; text: string; children: XmlNode[]; path: string; line: number };
type Component = Record<string, unknown>;
type Section = { id: string; name: string; type: string; height: number; layout: "absolute"; children: Component[]; groupId?: string; dataset?: string; appliesTo?: string; allowSplit?: boolean; newPageBefore?: boolean };

function local(name: string): string { return name.split(":").pop()!; }
function children(node: XmlNode, name: string): XmlNode[] { return node.children.filter((c) => local(c.name) === name); }
function child(node: XmlNode, name: string): XmlNode | undefined { return children(node, name)[0]; }
function content(node?: XmlNode): string { return node ? node.text + node.children.map(content).join("") : ""; }
function expressionNode(node: XmlNode, legacy: string): XmlNode | undefined { return child(node, legacy) ?? child(node, "expression"); }
function num(value: string | undefined, fallback = 0): number { const n = Number(value); return value !== undefined && Number.isFinite(n) ? n : fallback; }
function bool(value?: string): boolean { return value === "true"; }

function parseXml(xml: string): XmlNode {
  if (xml.length > 10_000_000) throw new Error("JRXML exceeds the 10 MB import limit.");
  const parser = new SaxesParser({ xmlns: false });
  const stack: XmlNode[] = [];
  let root: XmlNode | undefined;
  let nodes = 0;
  parser.on("doctype", () => { throw new Error("JRXML DTDs and external entities are not allowed."); });
  parser.on("opentag", (tag) => {
    if (++nodes > 50_000 || stack.length >= 128) throw new Error("JRXML exceeds the XML complexity limit.");
    const parent = stack.at(-1);
    const same = parent?.children.filter((c) => c.name === tag.name).length ?? 0;
    const node: XmlNode = {
      name: tag.name, attrs: tag.attributes as Record<string, string>, text: "", children: [],
      path: `${parent?.path ?? ""}/${local(tag.name)}[${same + 1}]`, line: parser.line,
    };
    if (parent) parent.children.push(node);
    else root = node;
    stack.push(node);
  });
  parser.on("text", (value) => { if (stack.length) stack[stack.length - 1]!.text += value; });
  parser.on("cdata", (value) => { if (stack.length) stack[stack.length - 1]!.text += value; });
  parser.on("closetag", () => { stack.pop(); });
  parser.write(xml).close();
  if (!root || local(root.name) !== "jasperReport") throw new Error("The XML root must be jasperReport.");
  return root;
}

function safeAst(expr: Expr): boolean {
  switch (expr.kind) {
    case "number": case "string": case "boolean": case "null": return true;
    case "path": return expr.segments.every((s) => s.type === "prop") &&
      expr.segments[0]?.type === "prop" && ["row", "params", "page", "vars"].includes(expr.segments[0].name);
    case "unary": return safeAst(expr.expr);
    case "binary": return safeAst(expr.left) && safeAst(expr.right);
    case "conditional": return safeAst(expr.cond) && safeAst(expr.then) && safeAst(expr.else);
    case "call": return false;
  }
}

/** Translate only data references and operators supported by the expression engine. */
export function translateJasperExpression(source: string, availableVariables: ReadonlySet<string> = new Set()): string | undefined {
  const trimmed = source.trim();
  if (!trimmed || /\$[RS]\{/.test(trimmed)) return undefined;
  // A Java method/constructor, cast, assignment, or block is never executed by the importer.
  if (/\bnew\s|\binstanceof\b|(?:^|[^=!<>])=(?!=)|;/.test(trimmed)) return undefined;
  let result = trimmed
    .replace(/\$F\{([A-Za-z_][\w.]*)\}/g, (_full, name: string) => `row.${name}`)
    .replace(/\$P\{([A-Za-z_][\w.]*)\}/g, (_full, name: string) => `params.${name}`)
    .replace(/\$V\{PAGE_NUMBER\}/g, "page.number")
    .replace(/\$V\{PAGE_COUNT\}/g, "page.total")
    .replace(/\$V\{([A-Za-z_]\w*)\}/g, (full, name: string) => availableVariables.has(name) ? `vars.${name}` : full);
  if (/\$[A-Z]\{/.test(result)) return undefined;
  try { if (!safeAst(Parser.parse(result))) return undefined; }
  catch { return undefined; }
  return result;
}

function javaType(value?: string): "string" | "number" | "boolean" | "date" | "datetime" | "object" {
  if (!value) return "string";
  if (/Boolean$/.test(value)) return "boolean";
  if (/(?:Integer|Long|Double|Float|BigDecimal|Short)$/.test(value)) return "number";
  if (/Date$/.test(value)) return "date";
  if (/Timestamp$/.test(value)) return "datetime";
  if (/String$/.test(value)) return "string";
  return "object";
}

function convertPattern(pattern: string): string | undefined {
  const numeric = pattern.match(/^#,##0(?:\.(0+))?$/) ?? pattern.match(/^0(?:\.(0+))?$/);
  if (numeric) return numeric[1] ? `number:${numeric[1].length}` : "number";
  if (/^(?:yyyy|MM|M|dd|d|HH|mm|ss|[-/ :])+$/.test(pattern)) return `date:${pattern}`;
  return undefined;
}

export function importJrxml(xml: string, options: { id?: string; name?: string; sourceName?: string } = {}): ImportResult {
  const issues: MigrationIssue[] = [];
  const summary: Record<MigrationStatus, number> = { converted: 0, "needs-review": 0, unsupported: 0 };
  const add = (status: MigrationStatus, feature: string, node: XmlNode, message: string, targetId?: string, original?: string) => {
    issues.push({ status, feature, source: node.path, line: node.line, message, ...(targetId ? { targetId } : {}), ...(original ? { original } : {}) });
    summary[status]++;
  };
  let root: XmlNode;
  try { root = parseXml(xml); }
  catch (error) {
    add("unsupported", "document", { path: "/", line: 0 } as XmlNode, (error as Error).message);
    return { issues, summary };
  }
  const isV7 = (function hasModernElement(node: XmlNode): boolean {
    return (local(node.name) === "element" && !!node.attrs.kind) || node.children.some(hasModernElement);
  })(root);
  const format = isV7 ? "v7-style" : "v6-style";
  let serial = 0;
  const id = () => `jr-${++serial}`;
  const groupNodes = children(root, "group");
  const groupIds = new Map(groupNodes.map((group, index) => [group.attrs.name, `group-${index + 1}`]));
  const variables: Array<{ id: string; scope: "row"; expression: string; resetOn?: string }> = [];
  const availableVariables = new Set<string>();
  for (const variable of children(root, "variable")) {
    const name = variable.attrs.name;
    const calculation = variable.attrs.calculation ?? "Nothing";
    const resetType = variable.attrs.resetType ?? "Report";
    const incrementType = variable.attrs.incrementType ?? "None";
    const source = content(expressionNode(variable, "variableExpression"));
    const value = translateJasperExpression(source);
    const resetOn = resetType === "Group" ? groupIds.get(variable.attrs.resetGroup) : undefined;
    if (!name || !/^[A-Za-z_]\w*$/.test(name) || !["Sum", "Count"].includes(calculation) || !value || (resetType !== "Report" && !resetOn) || incrementType !== "None") {
      add("unsupported", "Jasper variable", variable, "Variable calculation/reset needs manual migration.", undefined, source);
      continue;
    }
    const expression = calculation === "Sum"
      ? `(vars.${name} ?? 0) + (${value} ?? 0)`
      : `(vars.${name} ?? 0) + (${value} != null ? 1 : 0)`;
    variables.push({ id: name, scope: "row", expression, ...(resetOn ? { resetOn } : {}) });
    availableVariables.add(name);
    add("needs-review", "Jasper variable", variable, `${calculation} mapped to a running variable; check nulls, numeric precision and reset behavior against Jasper.`, name);
  }
  const placeholder = (node: XmlNode, feature: string, expression?: string, base: Component = {}, targetId = id()): Component => {
    add("unsupported", feature, node, `${feature} requires manual migration; a visible placeholder was inserted.`, targetId, expression);
    return { ...base, id: targetId, type: "text", value: `[Migration review: ${feature}]`, style: { color: "#b91c1c", fontSize: 9 } };
  };
  const translated = (value: string, feature: string, node: XmlNode, targetId: string): string | undefined => {
    const expression = translateJasperExpression(value, availableVariables);
    if (expression) add("converted", feature, node, "Safe expression converted.", targetId);
    else add("needs-review", feature, node, "Jasper expression needs manual translation.", targetId, value);
    return expression;
  };
  const geometry = (node: XmlNode, targetId: string): Component => {
    const el = child(node, "reportElement") ?? node;
    const style: Record<string, unknown> = {};
    if (el.attrs.forecolor) style.color = el.attrs.forecolor;
    if (el.attrs.backcolor && el.attrs.mode === "Opaque") style.background = el.attrs.backcolor;
    const te = child(node, "textElement");
    const font = te && child(te, "font");
    const f = font?.attrs ?? (local(node.name) === "element" ? node.attrs : {});
    if (f.fontName) style.fontFamily = f.fontName;
    if (f.size || f.fontSize) style.fontSize = num(f.size ?? f.fontSize);
    if (bool(f.isBold ?? f.bold)) style.fontWeight = "bold";
    if (bool(f.isItalic ?? f.italic)) style.italic = true;
    if (bool(f.isUnderline ?? f.underline)) style.underline = true;
    const align = te?.attrs.textAlignment ?? el.attrs.hTextAlign;
    if (align) style.align = align.toLowerCase() === "justified" ? "justify" : align.toLowerCase();
    const vertical = te?.attrs.verticalAlignment ?? el.attrs.vTextAlign;
    if (vertical) style.verticalAlign = vertical.toLowerCase();
    if (f.pdfFontName || f.pdfEncoding || f.isPdfEmbedded === "true")
      add("needs-review", "PDF font", font ?? node, "Jasper PDF font name, encoding, or embedding needs font-metric comparison.", targetId);
    const box = child(node, "box");
    if (box) {
      const padding = { top: num(box.attrs.topPadding), right: num(box.attrs.rightPadding), bottom: num(box.attrs.bottomPadding), left: num(box.attrs.leftPadding) };
      if (Object.values(padding).some(Boolean)) style.padding = padding;
      const pen = child(box, "pen");
      const sides = ["top", "right", "bottom", "left"] as const;
      const sidePens = sides.map((side) => child(box, `${side}Pen`));
      const borderSide = (sidePen?: XmlNode) => {
        const width = num(sidePen?.attrs.lineWidth ?? pen?.attrs.lineWidth);
        const lineStyle = sidePen?.attrs.lineStyle ?? pen?.attrs.lineStyle;
        const mappedStyle = lineStyle === "Dashed" ? "dashed" : lineStyle === "Dotted" ? "dotted" : "solid";
        return { width, style: width > 0 ? mappedStyle : "none", color: sidePen?.attrs.lineColor ?? pen?.attrs.lineColor ?? "#000000" };
      };
      if (sidePens.some(Boolean)) {
        style.border = Object.fromEntries(sides.map((side, index) => [side, borderSide(sidePens[index])]));
        add("needs-review", "border sides", box, "Jasper side-specific border pens mapped; compare line weights and joins in the PDF.", targetId);
      } else if (pen && num(pen.attrs.lineWidth) > 0) style.border = borderSide(pen);
    }
    const g: Component = { x: `${num(el.attrs.x)}pt`, y: `${num(el.attrs.y)}pt`, width: `${Math.max(0, num(el.attrs.width))}pt`, height: `${Math.max(0, num(el.attrs.height))}pt` };
    if (Object.keys(style).length) g.style = style;
    if (el.attrs.positionType || el.attrs.stretchType || node.attrs.isStretchWithOverflow === "true" || el.attrs.textAdjust === "StretchHeight") add("needs-review", "stretch/position", node, "Jasper stretch or position behavior may differ after pagination.", targetId);
    if (bool(el.attrs.isPrintWhenDetailOverflows ?? el.attrs.printWhenDetailOverflows)) add("needs-review", "overflow printing", node, "Jasper print-on-overflow needs pagination review.", targetId);
    if (bool(el.attrs.removeLineWhenBlank)) add("needs-review", "blank-line removal", node, "Jasper blank-line removal needs layout review.", targetId);
    if (el.attrs.style) add("needs-review", "named style", node, `Named style ${el.attrs.style} needs review.`, targetId);
    if (te?.attrs.markup && te.attrs.markup !== "none") add("needs-review", "text markup", node, `Jasper ${te.attrs.markup} markup needs review.`, targetId);
    const when = child(el, "printWhenExpression") ?? child(node, "printWhenExpression");
    if (when) {
      const ex = translated(content(when), "visibility condition", when, targetId);
      if (ex) g.visibleWhen = ex;
    }
    return g;
  };
  const convertElement = (node: XmlNode): Component => {
    const kind = local(node.name) === "element" ? (node.attrs.kind ?? "unknown element") : local(node.name);
    const targetId = id();
    const g = geometry(node, targetId);
    const base = { ...g, id: targetId };
    if (kind === "staticText") {
      add("converted", kind, node, "Static text and basic geometry converted.", targetId);
      return { ...base, type: "text", value: content(child(node, "text")) };
    }
    if (kind === "textField") {
      const source = content(expressionNode(node, "textFieldExpression"));
      const expression = translated(source, "text expression", node, targetId);
      if (!expression) return { ...base, type: "text", value: "[Migration review: text expression]", style: { ...((g.style as object) ?? {}), color: "#b91c1c" } };
      if (node.attrs.evaluationTime && node.attrs.evaluationTime !== "Now") {
        add("needs-review", "evaluation time", node, `Jasper ${node.attrs.evaluationTime} evaluation is deferred; a visible placeholder was inserted.`, targetId, source);
        return { ...base, type: "text", value: "[Migration review: deferred value]", style: { ...((g.style as object) ?? {}), color: "#b91c1c" } };
      }
      add("converted", kind, node, "Text field and basic geometry converted.", targetId);
      if (node.attrs.isBlankWhenNull === "false") add("needs-review", "null rendering", node, "Jasper null rendering needs output comparison.", targetId);
      const format = node.attrs.pattern ? convertPattern(node.attrs.pattern) : undefined;
      if (node.attrs.pattern) add(format ? "converted" : "needs-review", "format pattern", node,
        format ? "Jasper pattern mapped to an Open Reports format." : "Jasper pattern has no equivalent; output will use default formatting until reviewed.", targetId,
        format ? undefined : node.attrs.pattern);
      return { ...base, type: "field", expression, ...(format ? { format } : {}) };
    }
    if (kind === "image") {
      const source = content(expressionNode(node, "imageExpression")).trim();
      const literal = source.match(/^"([^"\r\n]+)"$/)?.[1];
      const binding = source.match(/^\$P\{([A-Za-z_]\w*)\}$/)?.[1];
      if (literal || binding) {
        add("converted", kind, node, "Image source retained as a path/URL or parameter binding.", targetId);
        add("needs-review", "image availability", node, "Confirm the rendering service can access this image source.", targetId);
        return { ...base, type: "image", ...(literal ? { src: literal } : { binding: `params.${binding}` }), whenMissing: "placeholder" };
      }
      return placeholder(node, "image expression", source, g, targetId);
    }
    if (kind === "line" || kind === "rectangle") {
      add("converted", kind, node, "Shape and geometry converted.", targetId);
      return { ...base, type: kind, ...(kind === "line" ? { orientation: num((child(node, "reportElement") ?? node).attrs.width) < num((child(node, "reportElement") ?? node).attrs.height) ? "vertical" : "horizontal" } : {}) };
    }
    if (kind === "frame") {
      const nested = node.children.filter((item) => ["staticText", "textField", "image", "line", "rectangle", "subreport", "frame", "componentElement", "crosstab", "element", "break", "ellipse"].includes(local(item.name))).map(convertElement);
      add("needs-review", "frame", node, "Frame children imported; clipping and stretch behavior need review.", targetId);
      return { ...base, type: "container", layout: "absolute", children: nested };
    }
    if (kind === "break") {
      add("needs-review", "page/column break", node, "Jasper break imported as a page break; column behavior needs review.", targetId);
      return { ...base, type: "pageBreak" };
    }
    if (kind === "subreport") {
      const source = content(expressionNode(node, "subreportExpression")).trim();
      // Older JRXML often names the compiled output in this expression. Use
      // its basename only as a hint for the corresponding .jrxml source file.
      // The compiled artifact is never opened or executed.
      const referencedName = source.match(/"([^"\r\n]+\.(?:jasper|jrxml))"/i)?.[1]?.split(/[/\\]/).pop();
      const sourceName = referencedName?.replace(/\.(?:jasper|jrxml)$/i, ".jrxml");
      const childId = sourceName?.slice(0, -6);
      const mode = child(node, "dataSourceExpression") ? "data-source-backed" : child(node, "connectionExpression") ? "connection-backed" : "source unspecified";
      const count = children(node, "subreportParameter").length;
      const dataSource = child(node, "dataSourceExpression");
      const dataset = dataSource ? translateJasperExpression(content(dataSource), availableVariables) : undefined;
      const params: Record<string, { expression: string }> = {};
      let safeParameters = true;
      for (const param of children(node, "subreportParameter")) {
        const expressionNode = child(param, "subreportParameterExpression") ?? child(param, "expression");
        if (!expressionNode) continue;
        const expression = translateJasperExpression(content(expressionNode), availableVariables);
        if (!param.attrs.name || !expression) {
          safeParameters = false;
          add("needs-review", "subreport parameter", param, "Parameter expression needs manual translation.", targetId, content(expressionNode));
        } else params[param.attrs.name] = { expression };
      }
      const linked = !!sourceName && /^[A-Za-z0-9_-]+\.jrxml$/i.test(sourceName) && safeParameters && (!dataSource || !!dataset);
      if (!linked) {
        add("unsupported", "subreport", node,
          `${sourceName ?? "Dynamic subreport"} is ${mode} with ${count} parameter${count === 1 ? "" : "s"}; its JRXML source or bindings need manual migration.`,
          targetId, source);
        return { ...base, type: "text", value: "[Migration review: subreport]", style: { ...((g.style as object) ?? {}), color: "#b91c1c", fontSize: 9 } };
      }
      add("needs-review", "subreport", node,
        `${sourceName} is ${mode} with ${count} parameter${count === 1 ? "" : "s"}; import this JRXML source as child report "${childId}", bind child datasets, and compare nested pagination.`,
        targetId, source);
      return { ...base, type: "subreport", reportId: childId, ...(dataset ? { dataset } : {}), parameters: params };
    }
    if (kind === "component" || kind === "componentElement") {
      const nested = node.children.find((item) => local(item.name) === "component") ?? node.children.find((item) => ["table", "list", "barbecue", "barcode4j"].includes(local(item.name)));
      const feature = nested?.attrs.kind ?? (nested ? local(nested.name) : kind);
      return placeholder(node, feature, undefined, g, targetId);
    }
    if (kind === "crosstab") return convertCrosstab(node, base, targetId) ?? placeholder(node, "crosstab", undefined, g, targetId);
    return placeholder(node, kind, content(expressionNode(node, `${kind}Expression`)).trim(), g, targetId);
  };
  /** Jasper row/column groups and measures map onto an Open Reports crosstab; cell layouts and styles do not. */
  const CALCULATIONS: Record<string, string> = { Sum: "sum", Count: "count", DistinctCount: "count", Average: "avg", Lowest: "min", Highest: "max", Nothing: "sum" };
  function convertCrosstab(node: XmlNode, base: Component, targetId: string): Component | undefined {
    const bucket = (group: XmlNode) => {
      const b = child(group, "bucket");
      const binding = b ? translateJasperExpression(content(child(b, "bucketExpression") ?? b), availableVariables) : undefined;
      return binding ? { binding, header: group.attrs.name, ...(b?.attrs.order === "Descending" ? { sort: "desc" } : {}) } : undefined;
    };
    const rowGroups = children(node, "rowGroup");
    const columnGroups = children(node, "columnGroup");
    const rows = rowGroups.map(bucket);
    const columns = columnGroups.map(bucket);
    const measures = children(node, "measure").map((measure) => {
      const binding = translateJasperExpression(content(child(measure, "measureExpression") ?? measure), availableVariables);
      const calculation = measure.attrs.calculation ?? "Nothing";
      const aggregate = CALCULATIONS[calculation];
      if (calculation === "DistinctCount" || calculation === "Nothing") add("needs-review", "crosstab measure", measure, `Jasper ${calculation} was mapped to ${aggregate === "count" ? "a count" : "a sum"}; compare the values.`, targetId);
      return binding && aggregate ? { binding, aggregate, header: measure.attrs.name } : undefined;
    });
    if (!rows.length || [...rows, ...columns, ...measures].some((part) => !part) || !measures.length) {
      add("unsupported", "crosstab", node, "A crosstab group or measure expression could not be translated; rebuild it with the Crosstab component.", targetId);
      return undefined;
    }
    const runDataset = child(child(child(node, "crosstabDataset") ?? node, "dataset") ?? node, "datasetRun")?.attrs.subDataset;
    const hasTotal = (groups: XmlNode[]) => groups.some((group) => group.attrs.totalPosition && group.attrs.totalPosition !== "None");
    add("needs-review", "crosstab", node, `Crosstab groups, measures and totals converted${runDataset ? `; bind dataset "${runDataset}"` : ""}. Cell layout, colours and number patterns were not imported; compare the output.`, targetId);
    return { ...base, height: undefined, type: "crosstab", dataset: runDataset ?? "main", rows, columns, measures, totalRow: hasTotal(rowGroups), totalColumn: hasTotal(columnGroups) };
  }

  const sections: Section[] = [];
  const addBand = (band: XmlNode, type: string, label: string, groupId?: string) => {
    const section: Section = { id: id(), name: label, type, height: num(band.attrs.height), layout: "absolute", children: [] };
    if (groupId) section.groupId = groupId;
    if (type === "detail") section.dataset = "main";
    if (label === "lastPageFooter") section.appliesTo = "last";
    if (label === "summary" && bool(root.attrs.isSummaryNewPage)) section.newPageBefore = true;
    if (label === "title" && bool(root.attrs.isTitleNewPage)) section.newPageBefore = true;
    if (band.attrs.splitType === "Prevent") section.allowSplit = false;
    if (band.attrs.splitType === "Immediate") add("needs-review", "band split", band, "Jasper immediate split has no exact equivalent.", section.id);
    for (const item of band.children) {
      const kind = local(item.name);
      if (["staticText", "textField", "image", "line", "rectangle", "subreport", "frame", "componentElement", "crosstab", "element", "break", "ellipse"].includes(kind)) section.children.push(convertElement(item));
      else if (kind === "elementGroup") {
        for (const nested of item.children) section.children.push(convertElement(nested));
        add("needs-review", "element group", item, "Grouped elements imported; stretch behavior needs review.", section.id);
      }
      else if (kind !== "property" && kind !== "printWhenExpression") section.children.push(placeholder(item, kind));
    }
    const when = child(band, "printWhenExpression");
    if (when) {
      const ex = translated(content(when), "band condition", when, section.id);
      if (ex) (section as unknown as Record<string, unknown>).visibleWhen = ex;
    }
    sections.push(section);
    add("converted", label, band, "Band geometry and children imported.", section.id);
  };
  const addHolder = (holder: XmlNode, type: string, label: string, groupId?: string) => {
      const list = children(holder, "band");
      if (list.length) for (const band of list) addBand(band, type, label, groupId);
      else if (holder.attrs.height) addBand(holder, type, label, groupId);
      if (label === "columnHeader" || label === "columnFooter") add("needs-review", label, holder, "Mapped to a page band for a single-column report; repeat/position semantics need PDF comparison.");
  };
  const addRoot = (tag: string, type: string) => { for (const holder of children(root, tag)) addHolder(holder, type, tag); };
  const groups: Array<Record<string, unknown>> = [];
  for (const group of groupNodes) {
    const groupId = `group-${groups.length + 1}`;
    const raw = content(expressionNode(group, "groupExpression"));
    const by = translateJasperExpression(raw);
    groups.push({ id: groupId, name: group.attrs.name, by: by ?? "null", repeatHeader: bool(group.attrs.isReprintHeaderOnEachPage), newPage: bool(group.attrs.isStartNewPage) ? "before" : "none" });
    add(by ? "converted" : "needs-review", "group expression", group, by ? "Group key converted." : "Group key requires manual translation; temporary key groups all rows.", groupId, by ? undefined : raw);
    if (group.attrs.minHeightToStartNewPage && num(group.attrs.minHeightToStartNewPage) > 0) add("needs-review", "group page threshold", group, "Jasper minimum remaining page height needs pagination review.", groupId);
  }
  addRoot("background", "background");
  addRoot("title", "reportHeader");
  addRoot("pageHeader", "pageHeader");
  addRoot("columnHeader", "pageHeader");
  // A single-column Jasper report prints pageHeader followed by columnHeader.
  // Open Reports page masters are alternatives, so combine these bands into
  // one repeated master while retaining their absolute geometry within each band.
  const headerIndexes = sections.flatMap((section, index) => section.type === "pageHeader" ? [index] : []);
  if (headerIndexes.length > 1) {
    const first = sections[headerIndexes[0]!]!;
    let offset = Number(first.height ?? 0);
    for (const index of headerIndexes.slice(1)) {
      const next = sections[index]!;
      for (const component of next.children) first.children.push({
        ...component,
        y: `${num(String(component.y ?? 0)) + offset}pt`,
      });
      offset += Number(next.height ?? 0);
    }
    first.height = offset;
    first.name = "pageHeader + columnHeader";
    for (const index of headerIndexes.slice(1).reverse()) sections.splice(index, 1);
    add("needs-review", "stacked page headers", root, "Page and column headers stacked for a single-column page; compare repeat behavior and spacing.", first.id);
  }
  for (let index = 0; index < groupNodes.length; index++) for (const holder of children(groupNodes[index]!, "groupHeader"))
    addHolder(holder, "groupHeader", `${groupNodes[index]!.attrs.name ?? "Group"} header`, `group-${index + 1}`);
  addRoot("detail", "detail");
  for (let index = groupNodes.length - 1; index >= 0; index--) for (const holder of children(groupNodes[index]!, "groupFooter"))
    addHolder(holder, "groupFooter", `${groupNodes[index]!.attrs.name ?? "Group"} footer`, `group-${index + 1}`);
  addRoot("columnFooter", "pageFooter");
  addRoot("pageFooter", "pageFooter");
  addRoot("lastPageFooter", "pageFooter");
  addRoot("summary", "reportFooter");
  addRoot("noData", "noData");
  if (bool(root.attrs.isFloatColumnFooter ?? root.attrs.floatColumnFooter)) add("needs-review", "floating column footer", root, "Jasper floating column footer placement needs PDF comparison.");
  const parameters = children(root, "parameter")
    .filter((p) => !p.attrs.name?.startsWith("REPORT_"))
    .map((p) => {
      const kind = javaType(p.attrs.class);
      add(kind === "object" ? "needs-review" : "converted", "parameter", p, kind === "object" ? "Java object parameter needs manual data mapping." : "Parameter type converted.");
      const def = child(p, "defaultValueExpression") ?? child(p, "defaultValue");
      if (def) add("needs-review", "parameter default", def, "Jasper default expression was not run or copied into the report.", undefined, content(def));
      return { id: p.attrs.name || id(), type: kind };
    });
  const fields = children(root, "field").filter((f) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(f.attrs.name ?? ""))
    .map((f) => ({ path: f.attrs.name!, kind: javaType(f.attrs.class) === "datetime" ? "date" : javaType(f.attrs.class) }));
  for (const field of children(root, "field")) add("converted", "field declaration", field, "Field metadata imported; data source still needs binding.");
  const query = child(root, "queryString");
  if (query && content(query).trim()) add("needs-review", "SQL query", query, "SQL was not activated or copied. Bind a safe Open Reports dataset and provide parameters.");
  for (const style of children(root, "style")) add("needs-review", "named style", style, "Jasper named style inheritance needs manual review.");
  for (const scriptlet of children(root, "scriptlet")) add("unsupported", "scriptlet", scriptlet, "Java/Groovy scriptlets are never executed.");
  if (num(root.attrs.columnCount, 1) > 1) add("unsupported", "multi-column layout", root, "Multiple Jasper columns are not represented by this import.");
  if (root.attrs.printOrder && root.attrs.printOrder !== "Vertical") add("needs-review", "print order", root, "Horizontal Jasper print order needs layout review.");
  if (bool(root.attrs.isIgnorePagination)) add("needs-review", "ignore pagination", root, "Jasper ignore-pagination output needs a separate Open Reports print profile.");
  if (root.attrs.whenNoDataType && root.attrs.whenNoDataType !== "NoPages") add("needs-review", "empty data behavior", root, `Jasper ${root.attrs.whenNoDataType} behavior needs review.`);
  const report = {
    schemaVersion: "1.0", id: options.id ?? `jrxml-${(root.attrs.name ?? "report").replace(/[^A-Za-z0-9_-]/g, "-").toLowerCase()}-${Date.now().toString(36)}`,
    name: options.name ?? root.attrs.name ?? "Imported JRXML", page: {
      size: "custom", unit: "pt", width: num(root.attrs.pageWidth, 595), height: num(root.attrs.pageHeight, 842),
      orientation: root.attrs.orientation?.toLowerCase() === "landscape" ? "landscape" : "portrait",
      margin: { top: num(root.attrs.topMargin), right: num(root.attrs.rightMargin), bottom: num(root.attrs.bottomMargin), left: num(root.attrs.leftMargin) },
    },
    parameters, datasets: [{ id: "main", source: "inline", query: [], schema: { kind: "array", fields: fields.filter((f) => f.kind !== "object") } }],
    groups, sections, variables,
    migration: {
      sourceFormat: "jrxml", sourceName: options.sourceName, format, summary,
      issues: issues.filter((issue) => issue.status !== "converted").map(({ status, feature, source, line, message, targetId }) => ({ status, feature, source, line, message, targetId })),
    },
  };
  const validation = parseReportDefinition(report);
  if (!validation.valid) {
    for (const issue of validation.issues) add("unsupported", "schema validation", root, `${issue.path}: ${issue.message}`);
    return { format, issues, summary };
  }
  return { report: validation.report, format, issues, summary };
}
