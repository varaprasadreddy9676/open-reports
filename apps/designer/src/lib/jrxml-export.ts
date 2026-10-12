import type { Doc } from "../model/ops";
import { parseReportDefinition } from "@reporting/schema";
import { Parser, type Expr } from "@reporting/expressions";
import JSZip from "jszip";

export interface JrxmlExportIssue {
  path: string;
  message: string;
}

export interface JrxmlExportResult {
  jrxml: string;
  issues: JrxmlExportIssue[];
  dependencies: { path: string; jrxml: string }[];
}

const esc = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const cdata = (value: unknown) => `<![CDATA[${String(value ?? "").replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
const safeName = (value: unknown, fallback: string) => {
  const result = String(value ?? "").replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(result) ? result : fallback;
};
const resourceName = (value: unknown) => {
  const source = String(value ?? "subreport");
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return `${safeName(source, "subreport")}-${(hash >>> 0).toString(16)}`;
};
const javaClass = (type: string) => ({ number: "java.math.BigDecimal", boolean: "java.lang.Boolean", date: "java.util.Date", datetime: "java.util.Date", object: "java.lang.Object", array: "java.lang.Object", enum: "java.lang.String" } as Record<string, string>)[type] ?? "java.lang.String";
const walkComponents = (components: any[]): any[] => (components ?? []).flatMap((component) => [component, ...walkComponents([...(component.children ?? []), ...(component.otherwise ?? []), ...(component.header ?? []), ...(component.footer ?? [])])]);
function jasperPattern(format: unknown): string | null {
  if (typeof format !== "string") return null;
  if (format === "currency:INR") return "'₹' #,##0.00;-'₹' #,##0.00";
  if (format === "currency") return "¤ #,##0.00";
  if (format === "percent") return "0%";
  if (format.startsWith("number")) {
    const [, digits = "", grouping = ""] = format.split(":");
    const places = digits === "" ? 3 : Math.max(0, Math.min(12, Number(digits) || 0));
    return `${grouping === "plain" ? "0" : "#,##0"}${places ? `.${"0".repeat(places)}` : ""}`;
  }
  if (format.startsWith("date:")) return format.slice(5);
  return null;
}

/** Translate the deliberately small arithmetic subset used by table formulas.
 * Arbitrary JavaScript is never copied into generated Java expressions. */
function arithmeticJavaExpression(source: string, field: (path: string) => string | null): string | null {
  const tokens = source.match(/\s*(?:row\.[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*|\d+(?:\.\d+)?|[()+*/-])\s*/g)?.map((token) => token.trim()).filter(Boolean);
  if (!tokens?.length || tokens.join("") !== source.replace(/\s/g, "")) return null;
  let cursor = 0;
  const primary = (): string | null => {
    const token = tokens[cursor++];
    if (!token) return null;
    if (token === "(") {
      const value = expression();
      if (tokens[cursor++] !== ")" || !value) return null;
      return value;
    }
    if (token === "-") {
      const value = primary();
      return value ? `${value}.negate()` : null;
    }
    if (/^\d/.test(token)) return `new java.math.BigDecimal(${JSON.stringify(token)})`;
    if (token.startsWith("row.")) {
      const name = field(token.slice(4));
      return name ? `($F{${name}} == null ? java.math.BigDecimal.ZERO : new java.math.BigDecimal(String.valueOf($F{${name}})))` : null;
    }
    return null;
  };
  const term = (): string | null => {
    let value = primary();
    while (value && (tokens[cursor] === "*" || tokens[cursor] === "/")) {
      const operator = tokens[cursor++];
      const right = primary();
      if (!right) return null;
      value = operator === "*" ? `${value}.multiply(${right})` : `${value}.divide(${right}, java.math.MathContext.DECIMAL64)`;
    }
    return value;
  };
  const expression = (): string | null => {
    let value = term();
    while (value && (tokens[cursor] === "+" || tokens[cursor] === "-")) {
      const operator = tokens[cursor++];
      const right = term();
      if (!right) return null;
      value = operator === "+" ? `${value}.add(${right})` : `${value}.subtract(${right})`;
    }
    return value;
  };
  const result = expression();
  return result && cursor === tokens.length ? result : null;
}

/** Convert the Open Reports safe expression AST to Java used by Jasper.
 * The same grammar is used by the renderer, so statements/eval and arbitrary
 * Java never cross this boundary. Unsupported functions fail closed. */
function jasperExpression(source: string, refs: { field(path: string): string | null; groupKey?: string }): { java: string; kind: "string" | "number" | "boolean" | "object" } | null {
  try {
    const emit = (node: Expr): { java: string; kind: "string" | "number" | "boolean" | "object" } | null => {
      const numeric = (value: string) => `((${value}) == null ? java.math.BigDecimal.ZERO : new java.math.BigDecimal(String.valueOf(${value})))`;
      switch (node.kind) {
        case "number": return { java: `new java.math.BigDecimal(${JSON.stringify(String(node.value))})`, kind: "number" };
        case "string": return { java: JSON.stringify(node.value), kind: "string" };
        case "boolean": return { java: String(node.value), kind: "boolean" };
        case "null": return { java: "null", kind: "object" };
        case "path": {
          const parts = node.segments.map((segment) => segment.type === "prop" ? segment.name : null);
          if (parts.some((part) => part === null)) return null;
          const path = parts.join(".");
          if (path === "group.key" && refs.groupKey) return { java: refs.groupKey, kind: "object" };
          if (path.startsWith("params.")) return { java: `$P{${safeName(path.slice(7), "parameter")}}`, kind: "object" };
          if (path.startsWith("vars.")) return { java: `$V{${safeName(path.slice(5), "variable")}}`, kind: "object" };
          if (path === "page.number") return { java: "$V{PAGE_NUMBER}", kind: "number" };
          if (path === "page.isFirst") return { java: "$V{PAGE_NUMBER} == 1", kind: "boolean" };
          const fieldPath = path.startsWith("data.") ? path.slice(5) : path.startsWith("row.") ? path.slice(4) : null;
          if (fieldPath !== null) {
            const name = refs.field(fieldPath);
            return name ? { java: `$F{${name}}`, kind: "object" } : null;
          }
          return null;
        }
        case "unary": {
          const value = emit(node.expr);
          if (!value) return null;
          return node.op === "!"
            ? { java: `!java.lang.Boolean.TRUE.equals(${value.java})`, kind: "boolean" }
            : { java: `${numeric(value.java)}.negate()`, kind: "number" };
        }
        case "conditional": {
          const cond = emit(node.cond), yes = emit(node.then), no = emit(node.else);
          if (!cond || !yes || !no) return null;
          const kind = yes.kind === no.kind ? yes.kind : "object";
          return { java: `(java.lang.Boolean.TRUE.equals(${cond.java}) ? ${yes.java} : ${no.java})`, kind };
        }
        case "binary": {
          const left = emit(node.left), right = emit(node.right);
          if (!left || !right) return null;
          const op = node.op;
          if (op === "==" || op === "!=") return { java: `${op === "!=" ? "!" : ""}java.util.Objects.equals(${left.java}, ${right.java})`, kind: "boolean" };
          if ([">", ">=", "<", "<="].includes(op)) {
            const compare = left.kind === "number" || right.kind === "number"
              ? `${numeric(left.java)}.compareTo(${numeric(right.java)})`
              : `((java.lang.Comparable)${left.java}).compareTo(${right.java})`;
            return { java: `${compare} ${op} 0`, kind: "boolean" };
          }
          if (op === "&&" || op === "||") return { java: `(java.lang.Boolean.TRUE.equals(${left.java}) ${op} java.lang.Boolean.TRUE.equals(${right.java}))`, kind: "boolean" };
          if (op === "??") return { java: `(${left.java} == null ? ${right.java} : ${left.java})`, kind: left.kind === right.kind ? left.kind : "object" };
          if (op === "+" && (left.kind === "string" || right.kind === "string")) return { java: `(String.valueOf(${left.java}) + String.valueOf(${right.java}))`, kind: "string" };
          const a = numeric(left.java), b = numeric(right.java);
          const java = op === "+" ? `${a}.add(${b})` : op === "-" ? `${a}.subtract(${b})` : op === "*" ? `${a}.multiply(${b})` : op === "/" ? `${a}.divide(${b}, java.math.MathContext.DECIMAL64)` : `${a}.remainder(${b})`;
          return { java, kind: "number" };
        }
        case "call": {
          const args = node.args.map(emit);
          if (args.some((arg) => !arg)) return null;
          const a = args.map((arg) => arg!.java);
          const str = (index: number) => `(${a[index]} == null ? "" : String.valueOf(${a[index]}))`;
          const methods: Record<string, string> = {
            upper: `(${str(0)}).toUpperCase(java.util.Locale.ROOT)`,
            lower: `(${str(0)}).toLowerCase(java.util.Locale.ROOT)`,
            trim: `(${str(0)}).trim()`,
            concat: `(${a.map((_, index) => str(index)).join(" + ") || '""'})`,
            substring: `(${str(0)}).substring(((Number)${a[1]}).intValue()${a[2] ? `, ((Number)${a[2]}).intValue()` : ""})`,
            replace: `(${str(0)}).replace(${str(1)}, ${str(2)})`,
            contains: `(${str(0)}).contains(${str(1)})`,
            startsWith: `(${str(0)}).startsWith(${str(1)})`,
            endsWith: `(${str(0)}).endsWith(${str(1)})`,
            formatDate: `(${a[0]} == null ? null : new java.text.SimpleDateFormat(${a[1] ?? '"yyyy-MM-dd"'}).format((java.util.Date)${a[0]}))`,
          };
          if (node.name in methods) return { java: methods[node.name]!, kind: ["contains", "startsWith", "endsWith"].includes(node.name) ? "boolean" : "string" };
          const numericArgs = a.map((arg) => numeric(arg));
          if (node.name === "abs" && a.length === 1) return { java: `${numericArgs[0]}.abs()`, kind: "number" };
          if (node.name === "round" && a.length <= 2) return { java: a.length === 1 ? `${numericArgs[0]}.setScale(0, java.math.RoundingMode.HALF_UP)` : `${numericArgs[0]}.setScale(((Number)${a[1]}).intValue(), java.math.RoundingMode.HALF_UP)`, kind: "number" };
          if (["ceil", "floor"].includes(node.name) && a.length === 1) return { java: `${numericArgs[0]}.setScale(0, java.math.RoundingMode.${node.name === "ceil" ? "CEILING" : "FLOOR"})`, kind: "number" };
          return null;
        }
      }
    };
    return emit(Parser.parse(source));
  } catch { return null; }
}

/** Export the supported static and field-bound subset as JasperReports 6.20 compatible JRXML.
 * Unsupported Open Reports features are listed in `issues`; the UI asks before downloading a lossy export.
 */
function exportJrxmlSource(doc: Doc, options: { subreportDir: string; ancestors: Set<string>; asSubreport?: boolean }): Omit<JrxmlExportResult, "dependencies"> {
  const issues: JrxmlExportIssue[] = [];
  const page = doc.page ?? {};
  const factor = ({ mm: 72 / 25.4, cm: 72 / 2.54, in: 72, px: 72 / 96, pt: 1 } as Record<string, number>)[page.unit ?? "mm"] ?? 72 / 25.4;
  // Component geometry is normalized to points by the layout engine. Page
  // dimensions/margins instead use page.unit, so keep those conversions apart.
  const points = (value: unknown, fallback: number, available = 0) => {
    if (typeof value === "number") return Math.max(0, Math.round(value));
    if (typeof value === "string" && /^-?\d+(\.\d+)?%$/.test(value)) return Math.max(0, Math.round(available * Number(value.slice(0, -1)) / 100));
    if (typeof value === "string" && /^\d+(\.\d+)?(mm|cm|in|pt|px)$/.test(value)) {
      const m = value.match(/^([\d.]+)(mm|cm|in|pt|px)$/)!;
      const unitFactor = ({ mm: 72 / 25.4, cm: 72 / 2.54, in: 72, px: 72 / 96, pt: 1 } as Record<string, number>)[m[2]!]!;
      return Math.max(0, Math.round(Number(m[1]) * unitFactor));
    }
    return fallback;
  };
  const sizes: Record<string, [number, number]> = { A4: [595, 842], A3: [842, 1191], A5: [420, 595], A6: [298, 420], Letter: [612, 792], Legal: [612, 1008] };
  let [pageWidth, pageHeight] = page.size === "custom"
    ? [Math.round((typeof page.width === "number" ? page.width : 595 / factor) * factor), Math.round((typeof page.height === "number" ? page.height : 842 / factor) * factor)]
    : sizes[page.size ?? "A4"] ?? sizes.A4!;
  if ((page.orientation === "landscape" && pageWidth < pageHeight) || (page.orientation === "portrait" && pageWidth > pageHeight)) [pageWidth, pageHeight] = [pageHeight, pageWidth];
  const margin = page.margin ?? {};
  const pagePoints = (value: unknown, fallback: number) => typeof value === "number" ? Math.max(0, Math.round(value * factor)) : points(value, fallback);
  const left = options.asSubreport ? 0 : pagePoints(margin.left, 43), right = options.asSubreport ? 0 : pagePoints(margin.right, 43), top = options.asSubreport ? 0 : pagePoints(margin.top, 57), bottom = options.asSubreport ? 0 : pagePoints(margin.bottom, 57);
  const columnWidth = Math.max(1, pageWidth - left - right);
  let usesSubreports = false;
  const theme = doc.theme ?? {};
  const fontTokens = theme.fonts ?? {};
  const fontSizeTokens = theme.fontSizes ?? {};
  const colorTokens = theme.colors ?? {};
  const styleCache = new WeakMap<object, Record<string, any>>();
  const resolvedStyle = (component: any) => {
    if (component && typeof component === "object" && styleCache.has(component)) return styleCache.get(component)!;
    const named = component.textStyle ? theme.textStyles?.[component.textStyle] ?? {} : {};
    const style = { ...named, ...(component.style ?? {}) } as Record<string, any>;
    for (const [key, tokens] of [["fontFamily", fontTokens], ["fontSize", fontSizeTokens], ["color", colorTokens], ["background", colorTokens]] as const) {
      const value = style[key];
      if (typeof value === "string" && value.startsWith("$")) {
        const resolved = tokens[value.slice(1)];
        if (resolved === undefined) issues.push({ path: `components.${component.id ?? component.type}.${key}`, message: `Theme token ${value} is undefined; the Jasper default will be used.` });
        else style[key] = resolved;
      }
    }
    if (component && typeof component === "object") styleCache.set(component, style);
    return style;
  };
  const id = safeName(doc.id, "report");
  const path = (value: string) => value.replace(/^data\./, "");
  const fieldPaths = new Map<string, string>();
  const tableDatasets: string[] = [];
  const tableDatasetNames = new Set<string>();
  const implicitParameters = new Set<string>();
  const variableDefinitions = new Map<string, any>();
  const variableTypes = new Map<string, "java.lang.String" | "java.lang.Boolean" | "java.math.BigDecimal" | "java.lang.Object">();
  for (const variable of doc.variables ?? []) variableDefinitions.set(safeName(variable.id, "variable"), variable);
  let activeGroupKey: string | undefined;
  let activeSectionCondition: string | undefined;
  const addField = (value: string, where: string) => {
    const p = path(value);
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(p)) { issues.push({ path: where, message: `Field binding "${value}" cannot be mapped to a Jasper field.` }); return null; }
    if (!fieldPaths.has(p)) fieldPaths.set(p, `f_${safeName(p, "field")}`);
    return fieldPaths.get(p)!;
  };
  const addBinding = (value: string, where: string) => {
    if (value.startsWith("params.")) {
      const name = safeName(value.slice("params.".length), "parameter");
      if (!(doc.parameters ?? []).some((parameter: any) => safeName(parameter.id, "parameter") === name)) implicitParameters.add(name);
      return `$P{${name}}`;
    }
    if (value.startsWith("vars.")) return `$V{${safeName(value.slice("vars.".length), "variable")}}`;
    if (value === "group.key" && activeGroupKey) return activeGroupKey;
    if (value === "page.number") return "$V{PAGE_NUMBER}";
    const field = addField(value, where);
    return field ? `$F{${field}}` : null;
  };
  for (const [name, variable] of variableDefinitions) {
    const translated = jasperExpression(variable.expression, { field: (fieldPath) => addField(fieldPath, `variables.${name}.expression`) });
    variableTypes.set(name, translated?.kind === "number" ? "java.math.BigDecimal" : translated?.kind === "string" ? "java.lang.String" : translated?.kind === "boolean" ? "java.lang.Boolean" : "java.lang.Object");
  }
  const unsupported = (component: any, where: string, reason?: string) => issues.push({ path: where, message: reason ?? `The ${component.type} component is not supported in JRXML export and will be omitted.` });
  const tableSampleCount = (component: any) => {
    const datasetPath = String(component.dataset ?? "");
    const definition = (doc.datasets ?? []).find((candidate: any) => datasetPath === candidate.id || datasetPath.startsWith(`${candidate.id}.`));
    if (!definition?.query || typeof definition.query !== "object") return undefined;
    let rows: unknown = (definition.query as any).data;
    const relativePath = datasetPath === definition.id ? (definition.query as any).path : datasetPath.slice(definition.id.length + 1);
    for (const part of String(relativePath ?? "").split(".").filter(Boolean)) rows = rows && typeof rows === "object" ? (rows as any)[part] : undefined;
    return Array.isArray(rows) ? rows.length : undefined;
  };
  const estimateHeight = (children: any[], horizontal = false, availableWidth = columnWidth, gap = 0): number => {
    let cursor = 0;
    let bottom = 0;
    const list = children ?? [];
    gap = horizontal ? gap : 0;
    const visible = list.filter((c: any) => c && !c.hidden && c.type !== "custom");
    const fixedWidth = visible.filter((c: any) => c.width !== undefined && c.width !== "*").reduce((sum: number, c: any) => sum + points(c.width, 0, availableWidth), 0);
    const flexCount = visible.filter((c: any) => c.width === "*" || c.width === undefined).length;
    const flexWidth = flexCount ? Math.max(1, (availableWidth - fixedWidth - gap * Math.max(0, visible.length - 1)) / flexCount) : 0;
      const lineHeight = (c: any) => Math.max(1, Number(resolvedStyle(c).fontSize ?? 10) * 1.3);
    for (const c of list) {
      if (!c || c.hidden || c.type === "custom") continue;
      const y = typeof c.y === "number" ? points(c.y, 0) : horizontal ? 0 : cursor;
      const explicitHeight = c.height !== undefined || c.size !== undefined;
      const rows = c.type === "table" ? tableSampleCount(c) : undefined;
      const tableHeight = c.type === "table" ? rows !== undefined && rows <= 20 ? 18 + rows * 18 : 36 : 24;
      const ownHeight = points(c.height ?? c.size, c.type === "text" || c.type === "field" || c.type === "richText" ? lineHeight(c) : tableHeight);
      const childWidth = horizontal ? (c.width === "*" || c.width === undefined ? flexWidth : points(c.width, flexWidth, availableWidth)) : points(c.width, availableWidth, availableWidth);
      const innerHeight = Array.isArray(c.children) ? estimateHeight(c.children, c.type === "row" || c.layout === "row", childWidth, points(c.gap, 0, childWidth)) : 0;
      const h = explicitHeight ? ownHeight : Math.max(ownHeight, innerHeight);
      bottom = Math.max(bottom, y + h);
      if (c.y === undefined && !horizontal) cursor = y + h;
      if (horizontal) cursor += childWidth + gap;
    }
    return bottom;
  };
  const renderList = (children: any[], baseX = 0, baseY = 0, bandWidth = columnWidth, where = "section", horizontal = false, gap = 0, pageBackground = false) => {
    const out: string[] = [];
    let flowY = 0;
    let flowX = 0;
    const list = children ?? [];
    const visible = list.filter((c: any) => c && !c.hidden && c.type !== "custom");
    const fixedWidth = visible.filter((c: any) => c.width !== undefined && c.width !== "*").reduce((sum: number, c: any) => sum + points(c.width, 0, bandWidth), 0);
    const flexCount = visible.filter((c: any) => c.width === "*" || c.width === undefined).length;
    const flexWidth = flexCount ? Math.max(1, (bandWidth - fixedWidth - gap * Math.max(0, visible.length - 1)) / flexCount) : 0;
    let followsExpandingTable = false;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const at = `${where}.children[${i}]`;
      const outStart = out.length;
      if (!c || c.hidden) continue;
      if (c.type === "custom") { unsupported(c, at); continue; }
      const isFullPageBackgroundImage = pageBackground && c.type === "image";
      const x = Math.round(baseX + points(c.x, horizontal ? flowX : 0, bandWidth));
      const y = Math.round(baseY + points(c.y, horizontal ? 0 : flowY, pageHeight - top - bottom));
      const w = isFullPageBackgroundImage ? bandWidth : Math.max(1, Math.round(horizontal ? (c.width === "*" || c.width === undefined ? flexWidth : points(c.width, flexWidth, bandWidth)) : points(c.width, Math.max(1, bandWidth - (x - baseX)), bandWidth)));
      const explicitHeight = c.height !== undefined || c.size !== undefined;
      const childHeight = Array.isArray(c.children) ? estimateHeight(c.children, c.type === "row" || c.layout === "row", w, points(c.gap, 0, w)) : 0;
      const sampleCount = c.type === "table" ? tableSampleCount(c) : undefined;
      const defaultHeight = c.type === "line" ? 1 : c.type === "text" || c.type === "field" || c.type === "richText" ? Math.max(1, Number(c.style?.fontSize ?? doc.theme?.fontSize ?? 10) * 1.3) : c.type === "table" ? sampleCount !== undefined && sampleCount <= 20 ? 18 + sampleCount * 18 : 36 : 24;
      const h = isFullPageBackgroundImage ? Math.max(1, pageHeight - top - bottom) : Math.max(1, Math.round(explicitHeight ? points(c.height ?? c.size, defaultHeight, pageHeight - top - bottom) : Math.max(defaultHeight, childHeight)));
      const style = resolvedStyle(c);
      const float = followsExpandingTable ? ' positionType="Float"' : "";
      if (c.rules || c.styleWhen || c.link || c.pageBreakBefore || c.pageBreakAfter || c.keepTogether || c.keepWithNext || c.keepWithPrevious) {
        issues.push({ path: at, message: "Conditional styling, links, and advanced pagination rules are not translated to JRXML." });
      }
      if (c.type === "qrcode" || c.type === "barcode") {
        let codeExpression: string | null = null;
        if (c.binding) {
          const binding = addBinding(c.binding, at);
          if (binding) codeExpression = `String.valueOf(${binding})`;
        } else if (c.expression) {
          codeExpression = jasperExpression(c.expression, { field: (fieldPath) => addField(fieldPath, at), groupKey: activeGroupKey })?.java ?? null;
        } else if (c.value !== undefined && c.value !== null) codeExpression = JSON.stringify(String(c.value));
        if (!codeExpression) {
          issues.push({ path: at, message: "A QR/barcode needs a value, data binding, or a Jasper-compatible expression." });
          continue;
        }
        if (c.type === "qrcode") out.push(`<componentElement><reportElement x="${x}" y="${y}" width="${w}" height="${h}"${float}/><jr:QRCode><jr:codeExpression>${cdata(codeExpression)}</jr:codeExpression></jr:QRCode></componentElement>`);
        else {
          const symbology: Record<string, string> = { code128: "Code128", ean13: "EAN13", upc: "UPCA", code39: "Code39" };
          out.push(`<componentElement><reportElement x="${x}" y="${y}" width="${w}" height="${h}"${float}/><jr:barbecue type="${symbology[c.symbology] ?? "Code128"}" drawText="false"><jr:codeExpression>${cdata(codeExpression)}</jr:codeExpression></jr:barbecue></componentElement>`);
        }
      } else if (c.type === "chart") {
        const series = Array.isArray(c.series) ? c.series : [];
        if (!series.length || !c.categoryBinding) {
          issues.push({ path: at, message: "A Jasper chart needs at least one series and a category binding; the chart was omitted." });
          continue;
        }
        const chartDataset = String(c.dataset ?? "");
        const chartDatasetDef = (doc.datasets ?? []).find((candidate: any) => chartDataset === candidate.id || chartDataset.startsWith(`${candidate.id}.`));
        const relativeChartPath = chartDatasetDef ? chartDataset === chartDatasetDef.id ? (chartDatasetDef.query && typeof chartDatasetDef.query === "object" ? (chartDatasetDef.query as any).path || chartDatasetDef.id : chartDatasetDef.id) : chartDataset.slice(chartDatasetDef.id.length + 1) : chartDataset.replace(/^data\./, "");
        if (chartDatasetDef && chartDatasetDef.source !== "inline" && chartDatasetDef.source !== "json") issues.push({ path: at, message: `Chart dataset ${chartDatasetDef.id} uses ${chartDatasetDef.source}; pass its rows to the Jasper datasource at data.${relativeChartPath}.` });
        const datasetName = `ds_${safeName(c.id ?? `chart_${tableDatasets.length + 1}`, "chart")}`;
        if (tableDatasetNames.has(datasetName)) { issues.push({ path: at, message: `Duplicate chart dataset name ${datasetName}; give each chart a unique id.` }); continue; }
        tableDatasetNames.add(datasetName);
        const chartFields = new Map<string, string>();
        const registerChartField = (binding: string) => {
          const field = binding.replace(/^row\./, "");
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) return null;
          chartFields.set(field, field);
          return field;
        };
        const category = registerChartField(String(c.categoryBinding));
        if (!category) { issues.push({ path: at, message: `Chart category binding ${c.categoryBinding} must be a direct row field.` }); continue; }
        const valueExpressions = series.map((entry: any, index: number) => {
          const expr = entry.expression ? jasperExpression(entry.expression, { field: registerChartField })?.java : entry.binding ? registerChartField(entry.binding) ? `$F{${registerChartField(entry.binding)}}` : null : null;
          if (!expr) issues.push({ path: `${at}.series[${index}]`, message: "This chart series needs a direct row-field binding or a supported safe expression." });
          return { entry, expr };
        });
        const datasetDefXml = `<subDataset name="${esc(datasetName)}">${[...chartFields.values()].map((field) => `<field name="${esc(field)}" class="java.lang.Object"/>`).join("")}</subDataset>`;
        tableDatasets.push(datasetDefXml);
        const rows = chartDataset ? addBinding(chartDataset, at) : null;
        if (chartDataset && !rows) issues.push({ path: at, message: `Chart dataset ${chartDataset} could not be mapped to a Jasper collection field.` });
        const datasetRun = rows ? `<dataset><datasetRun subDataset="${esc(datasetName)}"><dataSourceExpression>${cdata(`new net.sf.jasperreports.engine.data.JRMapCollectionDataSource((java.util.Collection)${rows})`)}</dataSourceExpression></datasetRun></dataset>` : "";
        const title = c.title ? `<chartTitle><titleExpression>${cdata(JSON.stringify(c.title))}</titleExpression></chartTitle>` : "";
        const chart = `<chart><reportElement x="${x}" y="${y}" width="${w}" height="${h}"${float}/>${title}<chartLegend/></chart>`;
        let contents = "";
        if (c.chartType === "pie") {
          const pieSeries = valueExpressions.map(({ entry, expr }: any) => expr ? `<pieSeries><keyExpression>${cdata(`$F{${category}}`)}</keyExpression><valueExpression>${cdata(`(java.lang.Number)${expr}`)}</valueExpression><labelExpression>${cdata(`String.valueOf($F{${category}})`)}</labelExpression></pieSeries>` : "").join("");
          contents = `<pieChart>${chart}<pieDataset>${datasetRun}${pieSeries}</pieDataset><piePlot><plot/></piePlot></pieChart>`;
        } else {
          const categorySeries = valueExpressions.map(({ entry, expr }: any) => expr ? `<categorySeries><seriesExpression>${cdata(JSON.stringify(String(entry.name ?? "Series")))}</seriesExpression><categoryExpression>${cdata(`$F{${category}}`)}</categoryExpression><valueExpression>${cdata(`(java.lang.Number)${expr}`)}</valueExpression></categorySeries>` : "").join("");
          const plot = c.chartType === "line" ? "linePlot" : "barPlot";
          const tag = c.chartType === "line" ? "lineChart" : "barChart";
          contents = `<${tag}>${chart}<categoryDataset>${datasetRun}${categorySeries}</categoryDataset><${plot}><plot/></${plot}></${tag}>`;
        }
        out.push(contents);
      } else if (c.type === "table") {
        const columns = Array.isArray(c.columns) ? c.columns : [];
        if (!columns.length) {
          unsupported(c, at, "A table with no columns cannot be represented in JRXML and was omitted.");
          continue;
        }
        const datasetName = `ds_${safeName(c.id ?? `table_${tableDatasets.length + 1}`, "table")}`;
        if (tableDatasetNames.has(datasetName)) {
          unsupported(c, at, `Duplicate table dataset name ${datasetName}; give each table a unique id.`);
          continue;
        }
        tableDatasetNames.add(datasetName);
        const rawDataset = String(c.dataset ?? "");
        const datasetDef = (doc.datasets ?? []).find((candidate: any) => rawDataset === candidate.id || rawDataset.startsWith(`${candidate.id}.`));
        const relativeRowsPath = datasetDef ? rawDataset === datasetDef.id ? (datasetDef.query && typeof datasetDef.query === "object" ? (datasetDef.query as any).path || datasetDef.id : datasetDef.id) : rawDataset.slice(datasetDef.id.length + 1) : rawDataset;
        const rowsBinding = relativeRowsPath
          ? addBinding(relativeRowsPath.startsWith("data.") || relativeRowsPath.startsWith("params.") ? relativeRowsPath : `data.${relativeRowsPath}`, at)
          : datasetDef ? null : addBinding(`data.${rawDataset}`, at);
        if (!rowsBinding) {
          issues.push({ path: at, message: `Table dataset "${rawDataset}" could not be mapped to a collection field; the table will receive an empty collection.` });
        }
        if (datasetDef && datasetDef.source !== "inline" && datasetDef.source !== "json") {
          issues.push({ path: at, message: `Dataset "${datasetDef.id}" uses ${datasetDef.source}; JRXML cannot execute the Open Reports data source. The host must pass its rows at data.${relativeRowsPath || datasetDef.id}.` });
        }
        let sampleRows: unknown = datasetDef?.query && typeof datasetDef.query === "object" ? (datasetDef.query as any).data : undefined;
        const samplePath = datasetDef && rawDataset === datasetDef.id
          ? (datasetDef.query && typeof datasetDef.query === "object" ? (datasetDef.query as any).path : "")
          : relativeRowsPath;
        for (const part of String(samplePath ?? "").split(".").filter(Boolean)) sampleRows = sampleRows && typeof sampleRows === "object" ? (sampleRows as any)[part] : undefined;
        const sampleRowCount = Array.isArray(sampleRows) ? sampleRows.length : undefined;
        const fieldNames = new Map<string, string>();
        const tableFieldNames = new Map<string, string>();
        const tableFieldTypes = new Map<string, string>();
        const tableFields: string[] = [];
        const registerTableField = (binding: string) => {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(binding)) return null;
          const name = tableFieldNames.get(binding) ?? safeName(binding, "field");
          tableFieldNames.set(binding, name);
          const schemaField = datasetDef?.schema?.fields?.find((field: any) => field.path.split(".").at(-1) === binding);
          const sampleValue = Array.isArray(sampleRows) ? (sampleRows[0] as any)?.[binding] : undefined;
          const kind = schemaField?.kind ?? (typeof sampleValue === "number" ? "number" : typeof sampleValue === "boolean" ? "boolean" : typeof sampleValue === "string" ? "string" : "object");
          tableFieldTypes.set(name, kind === "number" ? "java.lang.Number" : kind === "boolean" ? "java.lang.Boolean" : kind === "date" ? "java.util.Date" : "java.lang.Object");
          if (!tableFields.includes(name)) tableFields.push(name);
          return name;
        };
        for (const [columnIndex, column] of columns.entries()) {
          const binding = typeof column.binding === "string" ? column.binding.replace(/^row\./, "") : "";
          if (binding && registerTableField(binding)) {
            const fieldName = registerTableField(binding)!;
            fieldNames.set(column.id ?? String(columnIndex), fieldName);
          } else if (column.binding) {
            issues.push({ path: `${at}.columns[${columnIndex}]`, message: `Nested row binding "${column.binding}" cannot be resolved by Jasper's map collection datasource; use a direct row field or flatten the rows in the host.` });
          }
          if (column.expression && !arithmeticJavaExpression(column.expression, registerTableField)) issues.push({ path: `${at}.columns[${columnIndex}]`, message: "This table expression is outside the supported numeric arithmetic subset and its cell will be blank." });
          if (column.format && !jasperPattern(column.format)) issues.push({ path: `${at}.columns[${columnIndex}]`, message: `The table format "${column.format}" has no direct Jasper pattern mapping and needs manual formatting.` });
          if (column.format === "currency:INR") issues.push({ path: `${at}.columns[${columnIndex}]`, message: "The JRXML retains the ₹ currency pattern, but Jasper PDF output needs a runtime font with the rupee glyph; verify the PDF font extension and output." });
          const directField = fieldNames.get(column.id ?? String(columnIndex));
          if (String(column.format ?? "").startsWith("date:") && directField && tableFieldTypes.get(directField) !== "java.util.Date") {
            issues.push({ path: `${at}.columns[${columnIndex}]`, message: "Date patterns require the host data source to provide a java.util.Date field; the sample field is not typed as a date." });
          }
          if (column.rules?.length || column.link || column.mergeRepeated) issues.push({ path: `${at}.columns[${columnIndex}]`, message: "Table cell rules, links, and repeated-value merges are not translated to JRXML." });
          if (column.footer?.expression) issues.push({ path: `${at}.columns[${columnIndex}].footer`, message: "Custom table footer expressions are not translated; use a supported aggregate or edit the Jasper expression manually." });
        }
        if (c.headerRows?.length && (c.headerRows.length > 1 || c.headerRows.some((row: any[]) => row.some((cell: any) => cell.colSpan > 1 || cell.rowSpan > 1)))) {
          issues.push({ path: `${at}.headerRows`, message: "Multi-level and merged table headers are not translated; the exported table uses each column's simple header." });
        }
        if (c.filterWhen || c.sortBy?.length || c.groupBy || c.rowRules?.length || c.rowStyleWhen || c.alternateRowStyle || c.styles || c.tableStyle || c.cellSpans?.length || c.emptyState === "message") {
          issues.push({ path: at, message: "Table filtering, sorting, grouping, conditional/alternate styling, merged cells, and custom styles are not translated to JRXML." });
        }
        if (c.repeatHeaderOnPageBreak === false || c.allowRowSplit || c.minRowsBeforeBreak || c.minRowsAfterBreak || c.keepFooterTogether === false || c.keepRowTogether === false) {
          issues.push({ path: at, message: "Open Reports table pagination controls are not translated exactly; Jasper table pagination uses its own behavior." });
        }
        const widths = columns.map((column: any) => column.width === "*" || column.width === undefined ? 0 : points(column.width, 0, w));
        const specified = widths.reduce((sum: number, value: number) => sum + value, 0);
        const flexible = widths.filter((value: number) => value === 0).length;
        const flex = Math.max(1, Math.floor((w - specified) / Math.max(1, flexible)));
        const finalWidths = widths.map((value: number) => value || flex);
        const headerHeight = 18;
        const detailHeight = Math.max(18, Math.round(c.height !== undefined || c.size !== undefined ? (h - headerHeight) / Math.max(1, sampleRowCount ?? 1) : 18));
        const trailingContent = list.slice(i + 1).some((next: any) => next && !next.hidden && next.type !== "spacer");
        const tableLayoutHeight = Math.max(h, sampleRowCount !== undefined && sampleRowCount <= 20 ? headerHeight + sampleRowCount * detailHeight : sampleRowCount === undefined ? Math.max(h, headerHeight + detailHeight) : headerHeight + detailHeight);
        if (sampleRowCount === undefined && trailingContent) {
          issues.push({ path: at, message: "This table has no known sample row count and is followed by other elements. Jasper table rows can grow at runtime; move following content to a later band or verify it cannot overlap for the host data." });
        } else if (sampleRowCount !== undefined && trailingContent && sampleRowCount <= 20) {
          issues.push({ path: at, message: "Following elements are laid out using the sample row count. If runtime data has a different number of rows, move trailing content to a later band or review for overlap." });
        } else if (sampleRowCount !== undefined && trailingContent) {
          issues.push({ path: at, message: "This table has many sample rows and will paginate at runtime. Following elements stay at their authored position; move them to a later band or review for overlap." });
        }
        const footerVariables: string[] = [];
        const footerVariableNames = new Map<number, string>();
        for (const [columnIndex, column] of columns.entries()) {
          const aggregate = column.footer?.aggregate;
          if (!aggregate) continue;
          if (!["sum", "avg", "min", "max", "count"].includes(aggregate)) {
            issues.push({ path: `${at}.columns[${columnIndex}].footer`, message: `The ${aggregate} table aggregate is not translated to Jasper.` });
            continue;
          }
          const directField = fieldNames.get(column.id ?? String(columnIndex));
          const numericExpression = typeof column.expression === "string" ? arithmeticJavaExpression(column.expression, registerTableField) : null;
          const sourceExpression = numericExpression ?? (directField ? `($F{${directField}} == null ? java.math.BigDecimal.ZERO : new java.math.BigDecimal(String.valueOf($F{${directField}})))` : null);
          if (aggregate !== "count" && !sourceExpression) {
            issues.push({ path: `${at}.columns[${columnIndex}].footer`, message: "This numeric table total requires a direct field or supported arithmetic expression and was omitted." });
            continue;
          }
          const variableName = `v_${datasetName}_${columnIndex + 1}`;
          footerVariableNames.set(columnIndex, variableName);
          footerVariables.push(`<variable name="${esc(variableName)}" class="${aggregate === "count" ? "java.lang.Integer" : "java.math.BigDecimal"}" calculation="${aggregate === "sum" ? "Sum" : aggregate === "avg" ? "Average" : aggregate === "min" ? "Lowest" : aggregate === "max" ? "Highest" : "Count"}"><variableExpression>${cdata(aggregate === "count" ? "1" : sourceExpression!)}</variableExpression></variable>`);
        }
        const tableColumns = columns.map((column: any, columnIndex: number) => {
          const width = finalWidths[columnIndex];
          const fieldName = fieldNames.get(column.id ?? String(columnIndex));
          const calculatedExpression = typeof column.expression === "string" ? arithmeticJavaExpression(column.expression, registerTableField) : null;
          const align = column.align ? ` textAlignment="${column.align === "right" ? "Right" : column.align === "center" ? "Center" : "Left"}"` : "";
          const headerCell = c.headerRows?.[0]?.find((cell: any) => cell.column === columnIndex);
          const headerText = headerCell?.text ?? column.header ?? "";
          const headerAlign = headerCell?.align ? ` textAlignment="${headerCell.align === "right" ? "Right" : headerCell.align === "center" ? "Center" : "Left"}"` : align;
          const header = c.showHeader === false ? "" : `<jr:columnHeader height="${headerHeight}"><staticText><reportElement x="0" y="0" width="${width}" height="${headerHeight}" mode="Opaque" backcolor="#eeeeee"/><textElement${headerAlign}><font isBold="true"/></textElement><text>${cdata(headerText)}</text></staticText></jr:columnHeader>`;
          const footerVariable = footerVariableNames.get(columnIndex);
          const footer = c.showFooter ? `<jr:tableFooter height="18">${footerVariable ? `<textField isBlankWhenNull="true"><reportElement x="0" y="0" width="${width}" height="18"/><textElement${align}><font isBold="true"/></textElement><textFieldExpression class="${column.footer?.aggregate === "count" ? "java.lang.Integer" : "java.math.BigDecimal"}">${cdata(`$V{${footerVariable}}`)}</textFieldExpression></textField>` : column.footer?.label ? `<staticText><reportElement x="0" y="0" width="${width}" height="18"/><textElement${align}><font isBold="true"/></textElement><text>${cdata(column.footer.label)}</text></staticText>` : ""}</jr:tableFooter>` : "";
          const pattern = String(column.format ?? "").startsWith("date:") && fieldName && tableFieldTypes.get(fieldName) !== "java.util.Date" ? null : jasperPattern(column.format);
          const patternAttr = pattern ? ` pattern="${esc(pattern)}"` : "";
          const numericFormat = ["currency", "number", "percent"].includes(String(column.format ?? "").split(":")[0] ?? "");
          const formattedFieldExpression = fieldName && numericFormat ? `($F{${fieldName}} == null ? null : new java.math.BigDecimal(String.valueOf($F{${fieldName}})))` : null;
          const detailCell = calculatedExpression
            ? `<textField textAdjust="StretchHeight" isBlankWhenNull="true"${patternAttr}><reportElement x="0" y="0" width="${width}" height="${detailHeight}"/><textElement${align}><font/></textElement><textFieldExpression class="java.math.BigDecimal">${cdata(calculatedExpression)}</textFieldExpression></textField>`
            : formattedFieldExpression
            ? `<textField textAdjust="StretchHeight" isBlankWhenNull="true"${patternAttr}><reportElement x="0" y="0" width="${width}" height="${detailHeight}"/><textElement${align}><font/></textElement><textFieldExpression class="java.math.BigDecimal">${cdata(formattedFieldExpression)}</textFieldExpression></textField>`
            : fieldName
            ? `<textField textAdjust="StretchHeight" isBlankWhenNull="true"${patternAttr}><reportElement x="0" y="0" width="${width}" height="${detailHeight}"/><textElement${align}><font/></textElement><textFieldExpression class="${tableFieldTypes.get(fieldName) ?? "java.lang.Object"}">${cdata(`$F{${fieldName}}`)}</textFieldExpression></textField>`
            : "";
          return `<jr:column width="${width}">${footer}${header}<jr:detailCell height="${detailHeight}">${detailCell}</jr:detailCell></jr:column>`;
        }).join("");
        const definition = `<subDataset name="${esc(datasetName)}">${tableFields.map((fieldName) => `<field name="${esc(fieldName)}" class="${tableFieldTypes.get(fieldName) ?? "java.lang.Object"}"/>`).join("")}${footerVariables.join("")}</subDataset>`;
        tableDatasets.push(definition);
        const source = rowsBinding ? `new net.sf.jasperreports.engine.data.JRMapCollectionDataSource((java.util.Collection)$F{${rowsBinding.slice(3, -1)}})` : "new net.sf.jasperreports.engine.data.JRMapCollectionDataSource(java.util.Collections.emptyList())";
        const noDataType = c.emptyState === "hide" ? "Blank" : c.emptyState === "message" ? "NoDataCell" : "AllSectionsNoDetail";
        const noDataCell = c.emptyState === "message" ? `<jr:noData height="${detailHeight}"><staticText><reportElement x="0" y="0" width="${w}" height="${detailHeight}"/><textElement textAlignment="Center"><font/></textElement><text>${cdata(c.emptyMessage ?? "No records found")}</text></staticText></jr:noData>` : "";
        out.push(`<componentElement><reportElement x="${x}" y="${y}" width="${w}" height="${tableLayoutHeight}"${float}/><jr:table whenNoDataType="${noDataType}"><datasetRun subDataset="${esc(datasetName)}"><dataSourceExpression>${cdata(source)}</dataSourceExpression></datasetRun>${tableColumns}${noDataCell}</jr:table></componentElement>`);
        followsExpandingTable = true;
        if (c.y === undefined && !horizontal) flowY = Math.max(flowY, y - baseY + tableLayoutHeight);
      } else if (c.type === "text" || c.type === "richText" || c.type === "field") {
        let expr: string | null = null;
        let exprKind: "string" | "number" | "boolean" | "object" = "object";
        const binding = c.binding;
        if (binding) {
          expr = addBinding(binding, at);
          if (binding.startsWith("vars.")) exprKind = variableTypes.get(safeName(binding.slice(5), "variable")) === "java.math.BigDecimal" ? "number" : "object";
        } else if (c.expression) {
          const translated = jasperExpression(c.expression, { field: (fieldPath) => addField(fieldPath, at), groupKey: activeGroupKey });
          if (translated) { expr = translated.java; exprKind = translated.kind; }
          else issues.push({ path: at, message: "This expression uses a function or context that has no safe Jasper Java translation; the element will be omitted." });
        } else if (typeof c.value === "string" || typeof c.value === "number") expr = JSON.stringify(String(c.value));
        else if (c.value !== undefined) issues.push({ path: at, message: "Only text and numeric literal values can be exported as static JRXML text." });
        if (expr) {
          const pattern = jasperPattern(c.format);
          if (c.format && !pattern) issues.push({ path: at, message: `The value format "${c.format}" has no direct Jasper number/date pattern mapping.` });
          if (style.fontSize && typeof style.fontSize !== "number") issues.push({ path: at, message: "Theme font-size tokens are not resolved in the JRXML export." });
          if (style.color && !/^#[\da-f]{6}$/i.test(style.color) || style.background && !/^#[\da-f]{6}$/i.test(style.background)) issues.push({ path: at, message: "Only six-digit hex text and background colors are exported." });
          const align = style.align ? ` textAlignment="${esc(style.align === "center" ? "Center" : style.align === "right" ? "Right" : style.align === "justify" ? "Justified" : "Left")}"` : "";
          const vertical = style.verticalAlign ? ` verticalAlignment="${esc(style.verticalAlign === "middle" ? "Middle" : style.verticalAlign === "bottom" ? "Bottom" : "Top")}"` : "";
          const fontFamily = typeof style.fontFamily === "string" ? style.fontFamily : undefined;
          const font = `${fontFamily ? ` fontName="${esc(fontFamily)}"` : ""}${style.pdfFontFace ? ` pdfFontName="${esc(style.pdfFontFace)}" pdfEncoding="Identity-H"` : ""}${style.fontSize ? ` size="${Number(style.fontSize) || 10}"` : ""}${style.fontWeight === "bold" || Number(style.fontWeight) >= 600 ? " isBold=\"true\"" : ""}${style.italic ? " isItalic=\"true\"" : ""}${style.underline ? " isUnderline=\"true\"" : ""}${style.strikethrough ? " isStrikeThrough=\"true\"" : ""}`;
          const fg = style.color && /^#[\da-f]{6}$/i.test(style.color) ? ` forecolor="${esc(style.color)}"` : "";
          const paint = `${style.background ? " mode=\"Opaque\"" : ""}${style.background && /^#[\da-f]{6}$/i.test(style.background) ? ` backcolor="${esc(style.background)}"` : ""}${fg}`;
          const isExpression = Boolean(binding || c.expression || c.type === "field");
          const patternAttr = pattern && exprKind === "number" ? ` pattern="${esc(pattern)}"` : "";
          if (pattern && exprKind !== "number" && !String(c.format).startsWith("date:")) issues.push({ path: at, message: "The Jasper number pattern cannot be applied because this expression is not known to return a number." });
          const markup = c.type === "richText" ? ' markup="html"' : "";
          if (isExpression) out.push(`<textField textAdjust="StretchHeight" isBlankWhenNull="true"${patternAttr}><reportElement x="${x}" y="${y}" width="${w}" height="${h}"${float}${paint}/><textElement${align}${vertical}${markup}><font${font}/></textElement><textFieldExpression class="${exprKind === "number" ? "java.math.BigDecimal" : exprKind === "boolean" ? "java.lang.Boolean" : "java.lang.Object"}">${cdata(expr)}</textFieldExpression></textField>`);
          else if (c.type === "richText") out.push(`<staticText><reportElement x="${x}" y="${y}" width="${w}" height="${h}"${float}${paint}/><textElement${align}${vertical} markup="html"><font${font}/></textElement><text>${cdata(c.value)}</text></staticText>`);
          else out.push(`<staticText><reportElement x="${x}" y="${y}" width="${w}" height="${h}"${float}${paint}/><textElement${align}${vertical}><font${font}/></textElement><text>${cdata(c.value)}</text></staticText>`);
        }
      } else if (c.type === "image" && (c.binding || c.src)) {
        let imageExpression: string;
        let imageClass = "java.lang.String";
        if (c.binding) {
          const binding = addBinding(c.binding, at);
          if (!binding) continue;
          imageExpression = `${binding} == null ? null : String.valueOf(${binding})`;
        } else if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(c.src)) {
          const encoded = c.src.slice(c.src.indexOf(",") + 1);
          if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
            issues.push({ path: at, message: "This image data URI is malformed and has been omitted." });
            continue;
          }
          imageClass = "java.io.InputStream";
          imageExpression = `new java.io.ByteArrayInputStream(java.util.Base64.getDecoder().decode(${JSON.stringify(encoded)}))`;
        } else {
          imageExpression = JSON.stringify(c.src);
          if (/^https?:\/\//i.test(c.src)) issues.push({ path: at, message: `External image ${c.src} remains a runtime URL and must be reachable from the JasperReports host.` });
          else issues.push({ path: at, message: `Image path ${c.src} remains an external runtime resource and must be reachable from the JasperReports host.` });
        }
        const scale = c.fit === "fill" || c.fit === "stretch" ? "FillFrame" : c.fit === "cover" ? "Clip" : "RetainShape";
        if (c.fit === "cover") issues.push({ path: at, message: "Image fit 'cover' is approximated as Jasper's Clip scaling mode." });
        const onError = c.whenMissing === "fail" ? "Error" : "Blank";
        out.push(`<image scaleImage="${scale}" onErrorType="${onError}"><reportElement x="${x}" y="${y}" width="${w}" height="${h}"${float}/><imageExpression class="${imageClass}">${cdata(imageExpression)}</imageExpression></image>`);
      } else if (c.type === "line") {
        out.push(`<line><reportElement x="${x}" y="${y}" width="${c.orientation === "vertical" ? 1 : w}" height="${c.orientation === "vertical" ? h : 1}"${float}/><graphicElement><pen lineWidth="${Math.max(0.1, Number(style.border?.width ?? 0.5))}"${style.color && /^#[\da-f]{6}$/i.test(style.color) ? ` lineColor="${esc(style.color)}"` : ""}/></graphicElement></line>`);
      } else if (c.type === "rectangle") {
        const color = style.border?.color ?? style.color;
        out.push(`<rectangle${style.background ? ` radius="0"` : ""}><reportElement x="${x}" y="${y}" width="${w}" height="${h}"${float}${style.background && /^#[\da-f]{6}$/i.test(style.background) ? ` backcolor="${esc(style.background)}" mode="Opaque"` : ""}/><graphicElement><pen lineWidth="${Math.max(0.1, Number(style.border?.width ?? 1))}"${color && /^#[\da-f]{6}$/i.test(color) ? ` lineColor="${esc(color)}"` : ""}/></graphicElement></rectangle>`);
      } else if (c.type === "subreport") {
        const childSource = (doc.subreports as Record<string, unknown> | undefined)?.[c.reportId];
        const parsed = childSource ? parseReportDefinition(childSource) : undefined;
        if (!parsed?.valid) {
          unsupported(c, at, `Subreport "${c.reportId}" has no valid bundled Open Reports definition and was omitted.`);
          continue;
        }
        if (options.ancestors.has(parsed.report.id)) {
          unsupported(c, at, `Subreport cycle through "${parsed.report.id}" cannot be exported and was omitted.`);
          continue;
        }
        usesSubreports = true;
        const target = `${options.subreportDir}${resourceName(c.reportId)}.jasper`;
        const subParams: string[] = usesSubreports
          ? [`<subreportParameter name="SUBREPORT_DIR"><subreportParameterExpression>${cdata("$P{SUBREPORT_DIR}")}</subreportParameterExpression></subreportParameter>`]
          : [];
        for (const [name, value] of Object.entries(c.parameters ?? {})) {
          if (safeName(name, "parameter") === "SUBREPORT_DIR") {
            issues.push({ path: at, message: "SUBREPORT_DIR is reserved for resolving bundled JRXML subreports and is forwarded automatically." });
            continue;
          }
          if (value && typeof value === "object") {
            const expression = (value as { expression?: unknown }).expression;
            if (typeof expression === "string" && /^(data|params)\.[A-Za-z_][A-Za-z0-9_.]*$/.test(expression)) {
              const binding = addBinding(expression, at);
              if (binding) subParams.push(`<subreportParameter name="${esc(safeName(name, "parameter"))}"><subreportParameterExpression>${cdata(binding)}</subreportParameterExpression></subreportParameter>`);
              continue;
            }
            issues.push({ path: at, message: `Subreport parameter ${name} uses a JavaScript or object expression that cannot be translated; provide a literal or simple data./params. binding.` });
            continue;
          }
          if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") subParams.push(`<subreportParameter name="${esc(safeName(name, "parameter"))}"><subreportParameterExpression>${cdata(JSON.stringify(value))}</subreportParameterExpression></subreportParameter>`);
        }
        let sourceExpression = "new net.sf.jasperreports.engine.JREmptyDataSource(1)";
        if (c.dataset) {
          const binding = addBinding(c.dataset, at);
          if (binding) sourceExpression = `new net.sf.jasperreports.engine.data.JRMapCollectionDataSource((java.util.Collection)${binding})`;
          issues.push({ path: at, message: "The subreport collection is passed through JRMapCollectionDataSource; verify child field names against the Jasper data source shape." });
        } else if (parsed.report.datasets.length) {
          issues.push({ path: at, message: `Subreport ${c.reportId} requires dataset data, but no parent dataset is mapped. It will receive one empty row.` });
        }
        out.push(`<subreport isUsingCache="true"><reportElement x="${x}" y="${y}" width="${w}" height="${h}"${float}/>${subParams.join("")}<dataSourceExpression>${cdata(sourceExpression)}</dataSourceExpression><subreportExpression class="java.lang.String">${cdata(`$P{SUBREPORT_DIR} + ${JSON.stringify(target)}`)}</subreportExpression></subreport>`);
      } else if (["container", "row", "column", "grid", "keepTogether"].includes(c.type)) {
        const children = renderList(c.children ?? [], x, y, w, at, c.type === "row" || c.layout === "row", points(c.gap, 0, w), pageBackground);
        out.push(...children);
      } else if (["spacer"].includes(c.type)) {
      } else unsupported(c, at);
      const conditions = [activeSectionCondition];
      if (c.visibleWhen) {
        const translated = jasperExpression(c.visibleWhen, { field: (fieldPath) => addField(fieldPath, at), groupKey: activeGroupKey });
        if (translated?.kind === "boolean") conditions.push(translated.java);
        else issues.push({ path: at, message: "This visibility condition has no safe Jasper Boolean translation." });
      }
      const printWhen = conditions.filter(Boolean).map((condition) => `(${condition})`).join(" && ");
      if (printWhen) for (let outputIndex = outStart; outputIndex < out.length; outputIndex++) {
        out[outputIndex] = out[outputIndex]!.replace(/<reportElement\b([^>]*)\/>/g, `<reportElement$1><printWhenExpression>${cdata(printWhen)}</printWhenExpression></reportElement>`);
      }
      if (horizontal) flowX += w + gap;
      else if (c.y === undefined) flowY = Math.max(flowY, y - baseY + h);
    }
    return out;
  };
  const bandMap: Record<string, string> = { reportHeader: "title", pageHeader: "pageHeader", dataHeader: "columnHeader", detail: "detail", dataFooter: "summary", noData: "noData", pageFooter: "pageFooter", reportFooter: "summary", background: "background", columnHeader: "columnHeader", columnFooter: "columnFooter" };
  const bands = new Map<string, string[]>();
  const reportGroups = [...(doc.groups ?? [])] as any[];
  const legacyGroupIds = new Map<number, string>();
  for (const [i, section] of (doc.sections ?? []).entries()) {
    if ((section.type === "groupHeader" || section.type === "groupFooter") && !section.groupId && section.groupBy) {
      const groupId = safeName(section.id ?? `legacy_group_${i + 1}`, `legacy_group_${i + 1}`);
      legacyGroupIds.set(i, groupId);
      if (!reportGroups.some((group) => safeName(group.id, "group") === groupId)) reportGroups.push({ id: groupId, name: section.name, by: section.groupBy, sort: "none", repeatHeader: section.repeatEveryPage ?? false, newPage: "none", keepTogether: section.keepTogether ?? false });
    }
  }
  const groupBands = new Map<string, { header: string[]; footer: string[]; headerSections: any[]; footerSections: any[] }>();
  for (const group of reportGroups) groupBands.set(safeName(group.id, "group"), { header: [], footer: [], headerSections: [], footerSections: [] });
  for (const [i, section] of (doc.sections ?? []).entries()) {
    if (section.type === "groupHeader" || section.type === "groupFooter") {
      const groupId = safeName(section.groupId ?? legacyGroupIds.get(i) ?? "", "group");
      const target = groupBands.get(groupId);
      if (!target) {
        issues.push({ path: `sections[${i}]`, message: `This ${section.type} references a missing report group and was omitted.` });
        continue;
      }
      const group = reportGroups.find((candidate) => safeName(candidate.id, "group") === groupId);
      const groupKey = jasperExpression(String(group?.by ?? ""), { field: (fieldPath) => addField(fieldPath.replace(/^row\./, ""), `groups.${groupId}.by`) });
      activeGroupKey = groupKey?.java;
      const previousCondition = activeSectionCondition;
      activeSectionCondition = undefined;
      if (section.visibleWhen) {
        const condition = jasperExpression(section.visibleWhen, { field: (fieldPath) => addField(fieldPath, `sections[${i}].visibleWhen`), groupKey: activeGroupKey });
        if (condition?.kind === "boolean") activeSectionCondition = condition.java;
        else issues.push({ path: `sections[${i}].visibleWhen`, message: "This visibility condition has no safe Jasper Boolean translation." });
      }
      const contents = renderList(section.children ?? [], 0, 0, columnWidth, `sections[${i}]`);
      activeGroupKey = undefined;
      activeSectionCondition = previousCondition;
      if (section.type === "groupHeader") { target.header.push(...contents); target.headerSections.push(section); }
      else { target.footer.push(...contents); target.footerSections.push(section); }
      if (section.visibleWhen || section.rules || section.newPageBefore || section.newPageAfter || section.printAtBottom) issues.push({ path: `sections[${i}]`, message: "This group-band rule is not represented by the corresponding Jasper group-band setting." });
      continue;
    }
    const tag = bandMap[section.type];
    if (!tag) { issues.push({ path: `sections[${i}]`, message: `The ${section.type} band has no direct JRXML equivalent and will be omitted.` }); continue; }
    const printableHeight = Math.max(1, pageHeight - top - bottom);
    const hasFullPageBackgroundImage = section.type === "background" && (section.children ?? []).some((c: any) => c?.type === "image" && (points(c.height, 0) > printableHeight || points(c.width, 0) > columnWidth));
    if (hasFullPageBackgroundImage) issues.push({ path: `sections[${i}]`, message: "Jasper background bands are limited to the printable area; full-page background images are scaled to fit inside the page margins." });
    const condition = section.visibleWhen ? jasperExpression(section.visibleWhen, { field: (fieldPath) => addField(fieldPath, `sections[${i}].visibleWhen`) }) : null;
    if (section.visibleWhen && condition?.kind !== "boolean") issues.push({ path: `sections[${i}].visibleWhen`, message: "This visibility condition has no safe Jasper Boolean translation." });
    const previousCondition = activeSectionCondition;
    activeSectionCondition = condition?.kind === "boolean" ? condition.java : undefined;
    const contents = renderList(section.children ?? [], 0, 0, columnWidth, `sections[${i}]`, false, 0, section.type === "background");
    activeSectionCondition = previousCondition;
    if (section.rules || section.appliesTo && section.appliesTo !== "all" || section.newPageBefore || section.newPageAfter || section.printAtBottom || section.keepTogether || section.keepWithNext || section.keepWithPrevious || section.repeatEveryPage) issues.push({ path: `sections[${i}]`, message: "Band rules, page targeting, and advanced pagination settings are not translated in this JRXML export." });
    const estimatedHeight = Math.max(points(section.height, 0), estimateHeight(section.children ?? []));
    const height = Math.max(1, Math.round(section.type === "background" ? Math.min(estimatedHeight, printableHeight) : estimatedHeight) + (section.type === "background" ? 0 : 1));
    const band = `<band height="${height}"${section.allowSplit === false ? " splitType=\"Prevent\"" : ""}>${contents.join("")}</band>`;
    bands.set(tag, [...(bands.get(tag) ?? []), band]);
  }
  for (const [i, p] of (doc.parameters ?? []).entries()) {
    if (["string", "number", "boolean", "date", "datetime", "enum"].includes(p.type)) continue;
    issues.push({ path: `parameters[${i}]`, message: `Parameter type ${p.type} is exported as java.lang.Object.` });
  }
  const variableXml = (doc.variables ?? []).flatMap((variable: any, i: number) => {
    const name = safeName(variable.id, `variable_${i + 1}`);
    const translated = jasperExpression(variable.expression, { field: (fieldPath) => addField(fieldPath, `variables[${i}].expression`) });
    if (!translated) {
      issues.push({ path: `variables[${i}]`, message: "This variable expression has no safe Jasper Java translation and the variable was omitted." });
      return [];
    }
    const type = translated.kind === "number" ? "java.math.BigDecimal" : translated.kind === "string" ? "java.lang.String" : translated.kind === "boolean" ? "java.lang.Boolean" : "java.lang.Object";
    variableTypes.set(name, type);
    let reset = "";
    if (variable.scope === "row" && variable.resetOn) {
      if (reportGroups.some((group) => safeName(group.id, "group") === safeName(variable.resetOn, "group"))) reset = ` resetType="Group" resetGroup="${esc(safeName(variable.resetOn, "group"))}"`;
      else issues.push({ path: `variables[${i}].resetOn`, message: `Reset group ${variable.resetOn} is not declared and cannot be applied.` });
    }
    if (variable.scope === "page") reset = ' resetType="Page"';
    if (variable.scope === "group" || variable.scope === "report") issues.push({ path: `variables[${i}]`, message: `Jasper evaluates this ${variable.scope}-scoped expression during fill; verify that the referenced data scope is equivalent.` });
    return [`<variable name="${esc(name)}" class="${type}" calculation="Nothing"${reset}><variableExpression>${cdata(translated.java)}</variableExpression></variable>`];
  }).join("");
  const sortFields: string[] = [];
  const groupXml = reportGroups.map((group, i) => {
    const name = safeName(group.id, `group_${i + 1}`);
    const translated = jasperExpression(String(group.by ?? ""), { field: (fieldPath) => addField(fieldPath.replace(/^row\./, ""), `groups[${i}].by`) });
    if (!translated) {
      issues.push({ path: `groups[${i}].by`, message: "This group expression is not a direct data-field expression supported by Jasper group definitions." });
      return "";
    }
    const field = /\$F\{([^}]+)\}/.exec(translated.java)?.[1];
    if ((group.sort === "asc" || group.sort === "desc") && field) sortFields.push(`<sortField name="${esc(field)}" order="${group.sort === "desc" ? "Descending" : "Ascending"}"/>`);
    if (group.sort === "none") issues.push({ path: `groups.${name}.sort`, message: "The input Jasper datasource must already order these records so equal group keys are contiguous." });
    if (group.newPage === "after") issues.push({ path: `groups.${name}.newPage`, message: "JasperReports cannot start a page after a group using the same group setting; use a page break in the group footer." });
    if (group.minDetailRows > 1) issues.push({ path: `groups.${name}.minDetailRows`, message: "Jasper cannot enforce this exact minimum detail-row count beneath a group header." });
    const target = groupBands.get(name)!;
    const groupBand = (kind: "groupHeader" | "groupFooter", parts: string[], sections: any[]) => {
      if (!sections.length) return "";
      const height = Math.max(1, ...sections.map((section) => Math.max(points(section.height, 0), estimateHeight(section.children ?? []))));
      if (sections.length > 1) issues.push({ path: `groups.${name}.${kind}`, message: "Multiple Open Reports bands for a group share one Jasper band; review for overlapping object positions." });
      return `<${kind}><band height="${Math.round(height)}"${sections.some((section) => section.allowSplit === false) ? ' splitType="Prevent"' : ""}>${parts.join("")}</band></${kind}>`;
    };
    const header = groupBand("groupHeader", target.header, target.headerSections);
    const footer = groupBand("groupFooter", target.footer, target.footerSections);
    return `<group name="${esc(name)}"${group.repeatHeader ? ' isReprintHeaderOnEachPage="true"' : ""}${group.newPage === "before" ? ' isStartNewPage="true"' : ""}${group.keepTogether ? ' keepTogether="true"' : ""}><groupExpression>${cdata(translated.java)}</groupExpression>${header}${footer}</group>`;
  }).join("");
  if (doc.page?.continuous) issues.push({ path: "page.continuous", message: "Continuous roll page sizing has no direct fixed-page JRXML equivalent." });
  for (const [i, ds] of (doc.datasets ?? []).entries()) issues.push({ path: `datasets[${i}]`, message: `The ${ds.source} dataset and its data are not embedded in JRXML. Configure and pass the corresponding Jasper data source in the host application.` });
  const params = (doc.parameters ?? []).map((p: any, i: number) => {
    const name = safeName(p.id, "parameter");
    let defaultExpr: string | null = null;
    if (p.type === "string" || p.type === "enum") { if (typeof p.default === "string") defaultExpr = JSON.stringify(p.default); }
    else if (p.type === "boolean") { if (typeof p.default === "boolean") defaultExpr = String(p.default); }
    else if (p.type === "number") { if (typeof p.default === "number") defaultExpr = `new java.math.BigDecimal(${JSON.stringify(String(p.default))})`; }
    if (p.default !== undefined && defaultExpr === null) issues.push({ path: `parameters[${i}]`, message: "This parameter default is not represented in the JRXML export." });
    return `<parameter name="${esc(name)}" class="${javaClass(p.type)}" isForPrompting="${p.required ? "true" : "false"}">${defaultExpr === null ? "" : `<defaultValueExpression>${cdata(defaultExpr)}</defaultValueExpression>`}</parameter>`;
  }).join("") + [...implicitParameters].filter((name) => !(doc.parameters ?? []).some((parameter: any) => safeName(parameter.id, "parameter") === name)).map((name) => `<parameter name="${esc(name)}" class="java.lang.Object" isForPrompting="false"/>`).join("");
  if (usesSubreports) {
    const directoryParameter = (doc.parameters ?? []).find((parameter: any) => safeName(parameter.id, "parameter") === "SUBREPORT_DIR");
    if (directoryParameter && directoryParameter.type !== "string") issues.push({ path: "parameters.SUBREPORT_DIR", message: "SUBREPORT_DIR is reserved for JRXML subreport packages and should be a string parameter." });
  }
  const completeParams = `${params}${usesSubreports && !(doc.parameters ?? []).some((parameter: any) => safeName(parameter.id, "parameter") === "SUBREPORT_DIR") ? `<parameter name="SUBREPORT_DIR" class="java.lang.String" isForPrompting="false"/>` : ""}`;
  const fields = [...fieldPaths].map(([source, name]) => `<field name="${esc(name)}" class="java.lang.Object"><property name="net.sf.jasperreports.json.field.expression" value="${esc(source)}"/><fieldDescription>${cdata(source)}</fieldDescription></field>`).join("");
  if (doc.watermark?.text) {
    const watermark = doc.watermark;
    const backgroundHeight = Math.max(1, pageHeight - top - bottom);
    const color = /^#[\da-f]{6}$/i.test(watermark.color ?? "") ? watermark.color! : "#9ca3af";
    if (watermark.color && color !== watermark.color) issues.push({ path: "watermark.color", message: "The Jasper watermark uses a default gray because this color is not a six-digit hex value." });
    const angle = Number.isFinite(watermark.angle) ? watermark.angle : 45;
    const fontSize = Math.max(1, Number(watermark.fontSize) || Math.min(columnWidth, backgroundHeight) / 6);
    const opacity = Math.max(0, Math.min(1, watermark.opacity ?? 0.18));
    const centerX = columnWidth / 2, centerY = backgroundHeight / 2;
    const watermarkFont = typeof fontTokens.body === "string" ? fontTokens.body : "SansSerif";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${columnWidth}pt" height="${backgroundHeight}pt" viewBox="0 0 ${columnWidth} ${backgroundHeight}"><text x="${centerX}" y="${centerY}" text-anchor="middle" dominant-baseline="middle" font-family="${esc(watermarkFont)}" font-size="${fontSize}" font-weight="bold" fill="${esc(color)}" fill-opacity="${opacity}" transform="rotate(${-angle} ${centerX} ${centerY})">${esc(watermark.text)}</text></svg>`;
    const encoded = btoa(Array.from(new TextEncoder().encode(svg), (byte) => String.fromCharCode(byte)).join(""));
    const printWhen = watermark.pages === "first" ? '<printWhenExpression><![CDATA[$V{PAGE_NUMBER} == 1]]></printWhenExpression>' : "";
    const image = `<image scaleImage="RetainShape" onErrorType="Blank"><reportElement x="0" y="0" width="${columnWidth}" height="${backgroundHeight}">${printWhen}</reportElement><imageExpression class="java.io.InputStream">${cdata(`new java.io.ByteArrayInputStream(java.util.Base64.getDecoder().decode(${JSON.stringify(encoded)}))`)}</imageExpression></image>`;
    const existingBackground = bands.get("background");
    if (existingBackground?.length) existingBackground[0] = existingBackground[0]!.replace(/(<band\b[^>]*>)/, `$1${image}`);
    else bands.set("background", [`<band height="${backgroundHeight}">${image}</band>`]);
  }
  const bandOrder = ["background", "title", "pageHeader", "columnHeader", "detail", "columnFooter", "pageFooter", "summary", "noData"];
  const bandXml = bandOrder.filter((tag) => bands.has(tag)).map((tag) => {
    const list = bands.get(tag)!;
    if (list.length > 1) issues.push({ path: tag, message: `Multiple ${tag} bands are combined only partially by JRXML export.` });
    return `<${tag}>${list[0]}</${tag}>`;
  }).join("");
  const defaultFont = typeof fontTokens.body === "string" ? fontTokens.body : "SansSerif";
  const referencedFonts = new Set<string>([defaultFont]);
  for (const section of doc.sections ?? []) for (const component of walkComponents(section.children ?? [])) {
    const style = resolvedStyle(component);
    if (style.fontFamily) referencedFonts.add(style.fontFamily);
    if (style.pdfFontFace) referencedFonts.add(style.pdfFontFace);
  }
  const systemFonts = new Set(["SansSerif", "Serif", "Monospaced", "Dialog", "DialogInput", "Helvetica", "Times-Roman", "Courier", "Symbol", "ZapfDingbats"]);
  const customFonts = [...referencedFonts].filter((font) => !systemFonts.has(font));
  if (customFonts.length) issues.push({ path: "theme.fonts", message: `JRXML references ${customFonts.join(", ")}; install those fonts or a JasperReports font extension on the runtime host. Font binaries cannot be embedded in this report definition.` });
  const noticeComments = issues.map((issue) => `  <!-- Export note ${esc(issue.path)}: ${esc(issue.message).replaceAll("--", "—")} -->`).join("\n");
  const jrxml = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generated by Open Reports. Target: JasperReports 6.20.5. -->\n${noticeComments}${noticeComments ? "\n" : ""}<jasperReport xmlns="http://jasperreports.sourceforge.net/jasperreports" xmlns:jr="http://jasperreports.sourceforge.net/jasperreports/components" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://jasperreports.sourceforge.net/jasperreports http://jasperreports.sourceforge.net/xsd/jasperreport.xsd http://jasperreports.sourceforge.net/jasperreports/components http://jasperreports.sourceforge.net/xsd/components.xsd" name="${esc(id)}" pageWidth="${pageWidth}" pageHeight="${pageHeight}" columnWidth="${columnWidth}" leftMargin="${left}" rightMargin="${right}" topMargin="${top}" bottomMargin="${bottom}" whenNoDataType="AllSectionsNoDetail">\n  <property name="net.sf.jasperreports.default.font.name" value="${esc(defaultFont)}"/>\n  ${tableDatasets.join("")}${completeParams}${fields}${sortFields.join("")}${variableXml}${groupXml}\n  ${bandXml}\n</jasperReport>\n`;
  return { jrxml, issues };
}

export function exportJrxml(doc: Doc): JrxmlExportResult {
  const root = exportJrxmlSource(doc, { subreportDir: "subreports/", ancestors: new Set([doc.id]) });
  const dependencies: JrxmlExportResult["dependencies"] = [];
  const issues = [...root.issues];
  const collect = (parent: Doc, directory: string, ancestors: Set<string>) => {
    for (const [key, raw] of Object.entries(parent.subreports ?? {})) {
      const parsed = parseReportDefinition(raw);
      if (!parsed.valid) {
        issues.push({ path: `subreports.${key}`, message: "This bundled subreport is invalid and was not included in the JRXML package." });
        continue;
      }
      const child = parsed.report as unknown as Doc;
      if (ancestors.has(child.id)) {
        issues.push({ path: `subreports.${key}`, message: `Subreport cycle through ${child.id} cannot be exported.` });
        continue;
      }
      const name = resourceName(key);
      const result = exportJrxmlSource(child, { subreportDir: `${directory}${name}/`, ancestors: new Set([...ancestors, child.id]), asSubreport: true });
      dependencies.push({ path: `${directory}${name}.jrxml`, jrxml: result.jrxml });
      issues.push(...result.issues.map((issue) => ({ ...issue, path: `${directory}${name}.jrxml:${issue.path}` })));
      collect(child, `${directory}${name}/`, new Set([...ancestors, child.id]));
    }
  };
  collect(doc, "subreports/", new Set([doc.id]));
  return { jrxml: root.jrxml, issues, dependencies };
}

export function downloadJrxml(doc: Doc, result = exportJrxml(doc)): JrxmlExportResult {
  const blob = new Blob([result.jrxml], { type: "application/xml;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName(doc.id, "report")}.jrxml`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return result;
}

export async function createJrxmlPackage(doc: Doc, result = exportJrxml(doc)): Promise<Blob> {
  const zip = new JSZip();
  const name = safeName(doc.id, "report");
  zip.file(`${name}.jrxml`, result.jrxml);
  for (const dependency of result.dependencies) zip.file(dependency.path, dependency.jrxml);
  const allSources = [result.jrxml, ...result.dependencies.map((dependency) => dependency.jrxml)].join("\n");
  const mavenDependencies = [
    '<dependency><groupId>net.sf.jasperreports</groupId><artifactId>jasperreports</artifactId><version>6.20.5</version></dependency>',
    ...(allSources.includes("<jr:QRCode>") ? [
      '<dependency><groupId>net.sf.barcode4j</groupId><artifactId>barcode4j</artifactId><version>2.1</version></dependency>',
      '<dependency><groupId>com.google.zxing</groupId><artifactId>core</artifactId><version>3.4.0</version></dependency>',
    ] : []),
    ...(allSources.includes("<jr:barbecue") ? ['<dependency><groupId>net.sourceforge.barbecue</groupId><artifactId>barbecue</artifactId><version>1.5-beta1</version></dependency>'] : []),
    ...(allSources.includes("<jr:QRCode>") || allSources.includes("<jr:barbecue") ? ['<dependency><groupId>org.apache.xmlgraphics</groupId><artifactId>batik-bridge</artifactId><version>1.16</version></dependency>'] : []),
  ];
  zip.file("pom.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd"><modelVersion>4.0.0</modelVersion><groupId>local.openreports.export</groupId><artifactId>${name}-jrxml</artifactId><version>1.0.0</version><dependencies>${mavenDependencies.join("")}</dependencies></project>\n`);
  zip.file("README.md", [
    "# JasperReports JRXML source package",
    "",
    "EXPERIMENTAL: this is an interoperability bridge and migration aid generated by Open Reports for JasperReports 6.20.5. It is not a full-parity Jasper exporter.",
    "For the best experience, move report authoring to the Open Reports JSON format as soon as practical; it preserves the complete designer, rendering, and editing experience. Keep JRXML export for interoperability and migration during the transition.",
    "Compile, fill with representative production-shaped data, and visually compare every important page and output format before relying on these files.",
    "It contains source files only; compile each `.jrxml` to `.jasper` with JasperReports before runtime use.",
    "The included `pom.xml` declares JasperReports and any optional barcode libraries detected in the exported reports. Use it as a starting point and align dependency versions with your application.",
    "",
    "## Subreports",
    "",
    "Child report sources are under `subreports/`. Compile them while preserving the folder structure.",
    "The parent declares a `SUBREPORT_DIR` string parameter. Set it to the absolute package root path, including a trailing separator, so the relative paths in `subreports/` resolve.",
    "The Open Reports subreport component can map parameters and collections, but check the export notes for dataset-shape limitations.",
    "",
    "## Images and fonts",
    "",
    "Base64 image sources are embedded in the JRXML. URL and filesystem image sources remain external references and must be reachable from the JasperReports runtime host.",
    "Font family names and PDF font mappings are preserved where possible. Font binaries are not part of the Open Reports report definition; install required fonts or JasperReports font extensions on the runtime host.",
    "",
    "## Compatibility",
    "",
    "Read `EXPORT-NOTES.md` before using this package. Items listed there need manual Jasper binding or are approximated/omitted.",
  ].join("\n"));
  zip.file("EXPORT-NOTES.md", result.issues.length ? `# JRXML export notes\n\n${result.issues.map((issue) => `- \`${issue.path}\`: ${issue.message}`).join("\n")}\n` : "# JRXML export notes\n\nNo lossy-export notes were reported. Verify data sources and host fonts before production use.\n");
  return zip.generateAsync({ type: "blob", mimeType: "application/zip" });
}

export async function downloadJrxmlPackage(doc: Doc, result = exportJrxml(doc)): Promise<JrxmlExportResult> {
  const blob = await createJrxmlPackage(doc, result);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName(doc.id, "report")}-jrxml-source.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return result;
}
