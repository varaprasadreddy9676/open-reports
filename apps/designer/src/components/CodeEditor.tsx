import React, { useEffect, useMemo, useRef, useState } from "react";
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

function lineCol(text: string, pos: number) {
  const before = text.slice(0, pos);
  return { line: before.split("\n").length, col: pos - before.lastIndexOf("\n") };
}

export function CodeEditor() {
  const doc = useStore((s) => s.doc);
  const codeFocus = useStore((s) => s.codeFocus);
  const [text, setText] = useState(() => pretty(doc));
  const [status, setStatus] = useState<{ ok: boolean; messages: string[] }>({ ok: true, messages: [] });
  const area = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const applied = useRef(pretty(doc));
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // doc -> text, unless the user is typing here (their text is the source of truth then)
  useEffect(() => {
    const s = pretty(doc);
    if (s !== applied.current && !focused.current) {
      setText(s);
      applied.current = s;
      setStatus({ ok: true, messages: [] });
    }
  }, [doc]);

  // "Open in Code": jump to the component
  useEffect(() => {
    if (!codeFocus || !area.current) return;
    const current = pretty(useStore.getState().doc);
    if (!focused.current) {
      setText(current);
      applied.current = current;
    }
    requestAnimationFrame(() => {
      const a = area.current!;
      const idx = a.value.indexOf(`"id": "${codeFocus.id}"`);
      if (idx < 0) return;
      const lineStart = a.value.lastIndexOf("\n", idx) + 1;
      const lineEnd = a.value.indexOf("\n", idx);
      a.focus();
      a.setSelectionRange(lineStart, lineEnd < 0 ? a.value.length : lineEnd);
      const line = a.value.slice(0, lineStart).split("\n").length;
      a.scrollTop = Math.max(0, (line - 4) * 18);
    });
  }, [codeFocus]);

  function validate(value: string) {
    let parsed: any;
    try {
      parsed = JSON.parse(value);
    } catch (e) {
      const msg = (e as Error).message;
      const m = /position (\d+)/.exec(msg);
      const where = m ? lineCol(value, Number(m[1])) : undefined;
      setStatus({ ok: false, messages: [where ? `Line ${where.line}, column ${where.col}: ${msg}` : msg] });
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

  function onChange(value: string) {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const parsed = validate(value);
      if (parsed) {
        applied.current = pretty(parsed);
        useStore.getState().setDoc(ops.ensureIds(parsed), { coalesce: "code" });
      }
    }, 250);
  }

  function selectAtCursor() {
    const a = area.current;
    if (!a) return;
    const id = enclosingId(a.value, a.selectionStart);
    const s = useStore.getState();
    if (id && ops.find(s.doc, id) && s.selection[0] !== id) s.select([id]);
  }

  const lines = useMemo(() => text.split("\n").length, [text]);

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
            try {
              const f = pretty(JSON.parse(text));
              setText(f);
            } catch {
              /* ignore */
            }
          }}
        >
          Format
        </button>
        <a className="btn" href="/schema.json" target="_blank" rel="noreferrer" title="The published JSON Schema for IDE autocomplete">
          Schema
        </a>
      </div>
      <div className="code-body">
        <div className="gutter" ref={gutter} aria-hidden="true">
          {Array.from({ length: lines }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={area}
          data-testid="code-textarea"
          aria-label="Report definition JSON"
          spellCheck={false}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false;
            const s = pretty(useStore.getState().doc);
            if (status.ok && s !== applied.current) {
              setText(s);
              applied.current = s;
            }
          }}
          onClick={selectAtCursor}
          onKeyUp={(e) => ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown"].includes(e.key) && selectAtCursor()}
          onScroll={(e) => gutter.current && (gutter.current.scrollTop = e.currentTarget.scrollTop)}
        />
      </div>
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
