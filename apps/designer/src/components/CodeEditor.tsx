import React, { useEffect, useRef, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { json } from "@codemirror/lang-json";
import { linter, type Diagnostic } from "@codemirror/lint";
import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import { hoverTooltip } from "@codemirror/view";
import { parse as parseJsonc, parseTree, findNodeAtLocation, getLocation, type ParseError, printParseErrorCode } from "jsonc-parser";
import { parseReportDefinition } from "@reporting/schema";
import { useStore } from "../store";
import * as ops from "../model/ops";

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

/** The id of the component object enclosing text offset `pos`, found by walking out through enclosing braces. */
export function enclosingId(text: string, pos: number): string | undefined {
  let i = Math.min(pos, text.length - 1);
  while (i >= 0) {
    let depth = 0;
    let start = -1;
    for (let j = i; j >= 0; j--) {
      const ch = text[j];
      if (ch === "}") depth++;
      else if (ch === "{") {
        if (depth === 0) {
          start = j;
          break;
        }
        depth--;
      }
    }
    if (start < 0) return undefined;
    // scan this object's own top-level keys for "id"
    let d = 0;
    let inStr = false;
    for (let j = start; j < text.length; j++) {
      const ch = text[j];
      if (inStr) {
        if (ch === "\\") j++;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') {
        if (d === 1) {
          const m = /^"id"\s*:\s*"([^"]+)"/.exec(text.slice(j));
          if (m) return m[1];
        }
        inStr = true;
      } else if (ch === "{" || ch === "[") d++;
      else if (ch === "}" || ch === "]") {
        d--;
        if (d === 0) break;
      }
    }
    i = start - 1;
  }
  return undefined;
}

const PROPS: Record<string, string[]> = {
  common: ["id", "type", "name", "width", "height", "x", "y", "style", "visibleWhen", "keepTogether", "keepWithNext", "pageBreakBefore", "pageBreakAfter", "locked", "hidden", "grow", "gap", "alignItems", "justifyContent", "minWidth", "maxWidth", "minHeight", "maxHeight"],
  text: ["value", "binding", "expression", "format", "minLinesAtTop", "minLinesAtBottom"],
  table: ["dataset", "columns", "showHeader", "showFooter", "keepFooterTogether", "repeatHeaderOnPageBreak", "alternateRowStyle", "rowRules", "rowStyleWhen", "emptyState", "emptyMessage", "minRowsBeforeBreak", "minRowsAfterBreak", "allowRowSplit", "filterWhen", "sortBy"],
  container: ["children", "layout", "columns"],
  barcode: ["value", "expression", "symbology"],
  qrcode: ["value", "expression"],
  image: ["src", "fit", "alt", "whenMissing"],
  chart: ["chartType", "dataset", "categoryField", "valueField", "title"],
};
const COMPONENT_TYPES = ["text", "richText", "image", "line", "rectangle", "spacer", "container", "row", "column", "grid", "table", "repeater", "group", "keepTogether", "qrcode", "barcode", "chart", "pageBreak", "fragment"];
const DOCS: Record<string, string> = {
  type: "The component kind. Determines which other properties apply.",
  binding: "A data path such as data.invoice.number or row.amount (inside tables and repeaters).",
  expression: "A formula, e.g. row.quantity * row.rate. Evaluated by the safe expression engine - no JavaScript.",
  dataset: "Which dataset feeds this component, e.g. invoice.items for a nested list.",
  keepTogether: "Never split this element across pages; move it whole to the next page.",
  keepWithNext: "Keep with the following element (headings stay with their first rows).",
  repeatHeaderOnPageBreak: "Repeat the table header on every page the table spans.",
  visibleWhen: "Show the element only when this expression is true.",
  appliesTo: "Which pages this header/footer is used on: first, last, odd, even, standard.",
  safeMargin: "Printable margin the printer cannot reach, in mm.",
  dpi: "Printer resolution used to convert physical size into dots for label printers.",
  grow: "In a row: share of the extra width this element takes.",
  minLinesAtTop: "Minimum lines kept at the top of a page when a paragraph splits (widow control).",
  minLinesAtBottom: "Minimum lines left at the bottom of a page when a paragraph splits (orphan control).",
};

function enclosingType(text: string, pos: number): string | undefined {
  const tree = parseTree(text);
  if (!tree) return undefined;
  const loc = getLocation(text, pos);
  const path = [...loc.path];
  while (path.length) {
    const node = findNodeAtLocation(tree, path);
    if (node?.type === "object") {
      const t = node.children?.find((c) => c.children?.[0]?.value === "type")?.children?.[1]?.value;
      if (typeof t === "string") return t;
    }
    path.pop();
  }
  return undefined;
}

function completions(ctx: CompletionContext) {
  const text = ctx.state.doc.toString();
  const loc = getLocation(text, ctx.pos);
  const word = ctx.matchBefore(/"?[\w.$-]*/);
  const from = word ? word.from + (word.text.startsWith('"') ? 1 : 0) : ctx.pos;
  const doc = useStore.getState().doc;
  if (loc.isAtPropertyKey) {
    const t = enclosingType(text, ctx.pos) ?? "text";
    const group = t === "table" ? "table" : ["container", "row", "column", "grid", "repeater", "group", "keepTogether"].includes(t) ? "container" : PROPS[t] ? t : "text";
    const names = [...new Set([...(PROPS[group] ?? []), ...PROPS.common!])];
    return { from, options: names.map((n) => ({ label: n, type: "property", detail: DOCS[n] ? "" : undefined, info: DOCS[n], apply: n })), validFor: /^[\w]*$/ };
  }
  const key = loc.path[loc.path.length - 1];
  if (key === "type" && !loc.isAtPropertyKey) return { from, options: COMPONENT_TYPES.map((n) => ({ label: n, type: "enum" })) };
  if (key === "dataset") {
    const ids = (doc.datasets ?? []).map((d: any) => d.id);
    return { from, options: ids.map((n: string) => ({ label: n, type: "variable", detail: "dataset" })) };
  }
  if (key === "binding" || key === "expression") {
    const paths: string[] = [];
    for (const d of doc.datasets ?? []) {
      paths.push(`data.${d.id}`);
      const data = (useStore.getState().sample[d.id] ?? d.query?.data) as any;
      const sampleObj = Array.isArray(data) ? data[0] : data;
      if (sampleObj && typeof sampleObj === "object") for (const k of Object.keys(sampleObj)) paths.push(`data.${d.id}.${k}`, `row.${k}`);
    }
    paths.push("page.number", "page.total", ...(doc.parameters ?? []).map((p: any) => `params.${p.id}`), ...(doc.variables ?? []).map((v: any) => `vars.${v.id}`));
    return { from, options: [...new Set(paths)].map((n) => ({ label: n, type: "variable" })) };
  }
  return null;
}

const hover = hoverTooltip((view, pos) => {
  const text = view.state.doc.toString();
  const loc = getLocation(text, pos);
  if (!loc.isAtPropertyKey) return null;
  const key = loc.path[loc.path.length - 1];
  const info = typeof key === "string" ? DOCS[key] : undefined;
  if (!info) return null;
  return {
    pos,
    above: true,
    create() {
      const dom = document.createElement("div");
      dom.className = "cm-doc-tip";
      dom.innerHTML = `<strong>${String(key)}</strong><div>${info}</div>`;
      return { dom };
    },
  };
});

/** Squiggles for JSON syntax errors, and schema errors pinned to the offending node. */
const reportLinter = linter((view): Diagnostic[] => {
  const text = view.state.doc.toString();
  const errors: ParseError[] = [];
  const value = parseJsonc(text, errors, { allowTrailingComma: false });
  const out: Diagnostic[] = errors.map((e) => ({ from: e.offset, to: Math.min(text.length, e.offset + Math.max(1, e.length)), severity: "error", message: printParseErrorCode(e.error) }));
  if (errors.length === 0) {
    const result = parseReportDefinition(value);
    if (!result.valid) {
      const tree = parseTree(text);
      for (const i of result.issues.slice(0, 20)) {
        const path = i.path ? i.path.split(/[.[\]]+/).filter(Boolean).map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : [];
        let node = tree && path.length ? findNodeAtLocation(tree, path) : tree;
        let p = [...path];
        while (!node && tree && p.length) {
          p.pop();
          node = findNodeAtLocation(tree, p);
        }
        const from = node?.offset ?? 0;
        out.push({ from, to: Math.min(text.length, from + Math.min(node?.length ?? 1, 60)), severity: "error", message: `${i.path || "(root)"}: ${i.message}` });
      }
    }
  }
  return out;
});

function lineCol(text: string, pos: number) {
  const before = text.slice(0, pos);
  return { line: before.split("\n").length, col: pos - before.lastIndexOf("\n") };
}

/** Typed export so a report can live in a codebase. */
export function toTypeScript(doc: unknown): string {
  return `import type { ReportDefinitionInput } from "@reporting/schema";\n\nexport const report: ReportDefinitionInput = ${JSON.stringify(doc, null, 2)};\n`;
}

export function CodeEditor() {
  const doc = useStore((s) => s.doc);
  const codeFocus = useStore((s) => s.codeFocus);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>();
  const [status, setStatus] = useState<{ ok: boolean; messages: string[] }>({ ok: true, messages: [] });
  const focused = useRef(false);
  const applied = useRef(pretty(doc));
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const silent = useRef(false);

  function validate(value: string) {
    const errors: ParseError[] = [];
    const parsed = parseJsonc(value, errors);
    if (errors.length) {
      const w = lineCol(value, errors[0]!.offset);
      setStatus({ ok: false, messages: [`Line ${w.line}, column ${w.col}: ${printParseErrorCode(errors[0]!.error)}`] });
      return undefined;
    }
    const result = parseReportDefinition(parsed);
    if (!result.valid) {
      setStatus({ ok: false, messages: result.issues.slice(0, 6).map((i) => `${i.path || "(root)"}: ${i.message}`) });
      return undefined;
    }
    setStatus({ ok: true, messages: [] });
    return parsed;
  }

  function replaceText(text: string) {
    const v = view.current;
    if (!v) return;
    silent.current = true;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } });
    silent.current = false;
  }

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: pretty(useStore.getState().doc),
        extensions: [
          basicSetup,
          json(),
          reportLinter,
          autocompletion({ override: [completions] }),
          hover,
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !silent.current) {
              const value = u.state.doc.toString();
              clearTimeout(timer.current);
              timer.current = setTimeout(() => {
                const parsed = validate(value);
                if (parsed) {
                  applied.current = pretty(parsed);
                  useStore.getState().setDoc(ops.ensureIds(parsed), { coalesce: "code" });
                }
              }, 250);
            }
            if ((u.selectionSet || u.docChanged) && u.view.hasFocus && !silent.current) {
              const id = enclosingId(u.state.doc.toString(), u.state.selection.main.head);
              const s = useStore.getState();
              if (id && ops.find(s.doc, id) && s.selection[0] !== id) s.select([id]);
            }
          }),
          EditorView.domEventHandlers({
            focus: () => ((focused.current = true), false),
            blur: () => {
              focused.current = false;
              const s = pretty(useStore.getState().doc);
              if (s !== applied.current && validate(v.state.doc.toString())) {
                replaceText(s);
                applied.current = s;
              }
              return false;
            },
          }),
          EditorView.theme({ "&": { height: "100%", fontSize: "12.5px" }, ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } }),
        ],
      }),
    });
    view.current = v;
    (window as any).__codeView = v;
    return () => {
      v.destroy();
      view.current = undefined;
      delete (window as any).__codeView;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // model -> text, unless the user is typing here
  useEffect(() => {
    const s = pretty(doc);
    if (s !== applied.current && !focused.current) {
      replaceText(s);
      applied.current = s;
      setStatus({ ok: true, messages: [] });
    }
  }, [doc]);

  // "Open in Code": jump to the component
  useEffect(() => {
    const v = view.current;
    if (!codeFocus || !v) return;
    const current = pretty(useStore.getState().doc);
    if (!focused.current && current !== v.state.doc.toString()) {
      replaceText(current);
      applied.current = current;
    }
    const text = v.state.doc.toString();
    const idx = text.indexOf(`"id": "${codeFocus.id}"`);
    if (idx < 0) return;
    const lineStart = text.lastIndexOf("\n", idx) + 1;
    const lineEnd = text.indexOf("\n", idx);
    silent.current = true;
    v.dispatch({ selection: { anchor: lineStart, head: lineEnd < 0 ? text.length : lineEnd }, scrollIntoView: true });
    silent.current = false;
    v.focus();
  }, [codeFocus]);

  return (
    <div className="code-editor" data-testid="code-editor">
      <div className="code-toolbar">
        <span className="file">{doc.id}.report.json</span>
        <span className={`code-status ${status.ok ? "ok" : "bad"}`} data-testid="code-status">
          {status.ok ? "✓ valid" : `✕ ${status.messages.length} problem${status.messages.length > 1 ? "s" : ""}`}
        </span>
        <span className="spacer" />
        <button
          className="btn"
          data-testid="code-format"
          onClick={() => {
            const v = view.current;
            if (!v) return;
            try {
              replaceText(pretty(JSON.parse(v.state.doc.toString())));
            } catch {
              /* invalid JSON cannot be formatted */
            }
          }}
        >
          Format
        </button>
        <button
          className="btn"
          data-testid="code-export-ts"
          title="Copy the report as a typed TypeScript module"
          onClick={async () => {
            const ts = toTypeScript(useStore.getState().doc);
            try {
              await navigator.clipboard.writeText(ts);
              useStore.getState().toast("TypeScript copied to clipboard", "success");
            } catch {
              useStore.getState().toast("Could not access the clipboard", "error");
            }
          }}
        >
          Copy as TypeScript
        </button>
        <a className="btn" href="/api/v1/schema" target="_blank" rel="noreferrer" title="The published JSON Schema for IDE autocomplete">
          JSON Schema
        </a>
      </div>
      <div className="code-body cm-host" ref={host} data-testid="code-textarea" />
      {!status.ok && (
        <ul className="code-errors" role="alert">
          {status.messages.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
