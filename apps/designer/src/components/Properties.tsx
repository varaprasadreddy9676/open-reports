import React, { useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import * as ops from "../model/ops";
import { buildCalc, CALC_OPS, parseCalc, buildFormat, checkExpression, conditionToExpression, describeFormula, expressionToCondition, OPERATORS, parseFormat, titleCase, type Condition } from "../lib/lowcode";
import { candidatesFor, FUNCTION_CANDIDATES, type Candidate } from "../lib/bindings";
import { datasetValue, inferFields, arrayRefs } from "../lib/fields";
import { Icon } from "./Icon";

// ------------------------------------------------------------------ small controls
function Section({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [o, setO] = useState(open);
  return (
    <section className="prop-section">
      <button className="prop-section-title" aria-expanded={o} onClick={() => setO(!o)}>
        <span>{o ? "▾" : "▸"}</span> {title}
      </button>
      {o && <div className="prop-body">{children}</div>}
    </section>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function Num({ value, onChange, label, min, step = 1 }: { value: number | undefined; onChange: (v: number | undefined) => void; label: string; min?: number; step?: number }) {
  return (
    <input
      type="number"
      aria-label={label}
      value={value ?? ""}
      min={min}
      step={step}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
    />
  );
}

function Dim({ value, onChange, label, placeholder }: { value: unknown; onChange: (v: number | string | undefined) => void; label: string; placeholder?: string }) {
  return (
    <input
      aria-label={label}
      placeholder={placeholder ?? "auto"}
      value={value === undefined ? "" : String(value)}
      onChange={(e) => {
        const t = e.target.value.trim();
        onChange(t === "" ? undefined : t !== "" && !Number.isNaN(Number(t)) ? Number(t) : t);
      }}
    />
  );
}

function Color({ value, onChange, label }: { value: string | undefined; onChange: (v: string | undefined) => void; label: string }) {
  return (
    <span className="color">
      <input type="color" aria-label={label} value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} />
      <input aria-label={`${label} value`} placeholder="none" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)} />
    </span>
  );
}

// ------------------------------------------------------------------ formula editor (autocomplete + validation + friendly reading)
export function FormulaInput({ value, onChange, candidates, placeholder, testId }: { value: string; onChange: (v: string) => void; candidates: Candidate[]; placeholder?: string; testId?: string }) {
  const [focus, setFocus] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const error = checkExpression(value);
  const token = /[\w.]*$/.exec(value.slice(0, ref.current?.selectionStart ?? value.length))?.[0] ?? "";
  const suggestions = useMemo(() => {
    if (!focus || token.length < 1) return [];
    const t = token.toLowerCase();
    return [...candidates, ...FUNCTION_CANDIDATES].filter((c) => c.value.toLowerCase().includes(t) || c.label.toLowerCase().includes(t)).slice(0, 8);
  }, [focus, token, candidates]);

  function accept(c: Candidate) {
    const pos = ref.current?.selectionStart ?? value.length;
    const before = value.slice(0, pos).replace(/[\w.]*$/, "");
    onChange(before + c.value + value.slice(pos));
    setActive(0);
  }

  return (
    <div className="formula">
      <div className="formula-box">
        <span className="fx">fx</span>
        <input
          ref={ref}
          data-testid={testId ?? "formula-input"}
          className="mono"
          aria-label="Formula"
          aria-invalid={!!error}
          placeholder={placeholder ?? "e.g. row.quantity * row.rate"}
          value={value}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 120)}
          onKeyDown={(e) => {
            if (!suggestions.length) return;
            if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => (a + 1) % suggestions.length));
            else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => (a - 1 + suggestions.length) % suggestions.length));
            else if (e.key === "Enter" || e.key === "Tab") (e.preventDefault(), accept(suggestions[active]!));
          }}
        />
      </div>
      {suggestions.length > 0 && (
        <ul className="suggest" role="listbox">
          {suggestions.map((s, i) => (
            <li key={s.value} role="option" aria-selected={i === active} className={i === active ? "active" : ""} onMouseDown={(e) => (e.preventDefault(), accept(s))}>
              <span className="mono">{s.value}</span>
              <span className="muted">{s.group}</span>
            </li>
          ))}
        </ul>
      )}
      {error ? <div className="field-error" role="alert">{error}</div> : value ? <div className="muted small friendly">{describeFormula(value)}</div> : null}
    </div>
  );
}

// ------------------------------------------------------------------ value editor: text | field | formula
type ValueMode = "text" | "field" | "formula";

function modeOf(c: ops.Comp): ValueMode {
  if (c.expression !== undefined) return "formula";
  if (c.binding !== undefined) return "field";
  return "text";
}

function ValueEditor({ comp, valueKey = "value" }: { comp: ops.Comp; valueKey?: string }) {
  const { doc, sample } = useStore();
  const patch = useStore((s) => s.patch);
  const mode = modeOf(comp);
  const candidates = useMemo(() => candidatesFor(doc, sample, comp.id), [doc, sample, comp.id]);
  const setMode = (m: ValueMode) => {
    if (m === mode) return;
    if (m === "text") patch(comp.id, { binding: undefined, expression: undefined, [valueKey]: comp[valueKey] ?? "" });
    if (m === "field") patch(comp.id, { binding: comp.binding ?? candidates.find((c) => c.group !== "Page")?.value ?? "", expression: undefined, [valueKey]: undefined });
    if (m === "formula") patch(comp.id, { expression: comp.expression ?? (comp.binding ? comp.binding : JSON.stringify(String(comp[valueKey] ?? ""))), binding: undefined, [valueKey]: undefined });
  };
  return (
    <div className="value-editor">
      <div className="seg" role="tablist" aria-label="Content source">
        {(["text", "field", "formula"] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "active" : ""} data-testid={`value-mode-${m}`} onClick={() => setMode(m)}>
            {m === "text" ? "Text" : m === "field" ? "Field" : "fx Formula"}
          </button>
        ))}
      </div>
      {mode === "text" && (
        <textarea data-testid="value-text" aria-label="Content" rows={2} value={String(comp[valueKey] ?? "")} onChange={(e) => patch(comp.id, { [valueKey]: e.target.value })} />
      )}
      {mode === "field" && (
        <select data-testid="value-field" aria-label="Field" value={comp.binding ?? ""} onChange={(e) => patch(comp.id, { binding: e.target.value })}>
          {!candidates.some((c) => c.value === comp.binding) && <option value={comp.binding ?? ""}>{comp.binding || "Choose a field..."}</option>}
          {[...new Set(candidates.map((c) => c.group))].map((g) => (
            <optgroup key={g} label={g}>
              {candidates.filter((c) => c.group === g).map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
      {mode === "formula" && <FormulaOrCalc comp={comp} candidates={candidates} />}
    </div>
  );
}

function CalcBuilder({ expr, candidates, onChange }: { expr: string; candidates: Candidate[]; onChange: (v: string) => void }) {
  const terms = parseCalc(expr) ?? [{ operand: "" }];
  const fields = candidates.filter((c) => c.group !== "Functions" && c.group !== "Page");
  const setTerm = (i: number, patchTerm: Partial<(typeof terms)[number]>) => onChange(buildCalc(terms.map((t, j) => (j === i ? { ...t, ...patchTerm } : t))));
  return (
    <div className="calc-builder" data-testid="calc-builder">
      {terms.map((t, i) => (
        <div key={i} className="calc-term">
          {i > 0 && (
            <select aria-label="Operator" value={t.op ?? "+"} onChange={(e) => setTerm(i, { op: e.target.value as any })}>
              {CALC_OPS.map((o) => (
                <option key={o.op} value={o.op}>{o.label}</option>
              ))}
            </select>
          )}
          <select
            aria-label={`Operand ${i + 1}`}
            value={fields.some((f) => f.value === t.operand) ? t.operand : "__number"}
            onChange={(e) => setTerm(i, { operand: e.target.value === "__number" ? "0" : e.target.value })}
          >
            {fields.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
            <option value="__number">A number…</option>
          </select>
          {!fields.some((f) => f.value === t.operand) && (
            <input aria-label={`Number ${i + 1}`} type="number" value={t.operand} onChange={(e) => setTerm(i, { operand: e.target.value === "" ? "0" : e.target.value })} />
          )}
          {terms.length > 1 && (
            <button className="mini danger" aria-label="Remove term" onClick={() => onChange(buildCalc(terms.filter((_, j) => j !== i).map((x, j) => (j === 0 ? { operand: x.operand } : x))))}>
              ×
            </button>
          )}
        </div>
      ))}
      <button className="mini" data-testid="calc-add" onClick={() => onChange(buildCalc([...terms, { op: "+", operand: fields[0]?.value ?? "0" }]))}>
        + Add
      </button>
    </div>
  );
}

function FormulaOrCalc({ comp, candidates }: { comp: ops.Comp; candidates: Candidate[] }) {
  const patch = useStore((s) => s.patch);
  const expr = comp.expression ?? "";
  const simple = parseCalc(expr) !== undefined && /[+\-*/]/.test(expr);
  const [view, setView] = useState<"builder" | "formula">(simple ? "builder" : "formula");
  const canBuild = parseCalc(expr) !== undefined || expr.trim() === "";
  return (
    <>
      {canBuild && (
        <div className="seg small" role="tablist" aria-label="Formula style">
          <button role="tab" aria-selected={view === "builder"} className={view === "builder" ? "active" : ""} data-testid="calc-view-builder" onClick={() => setView("builder")}>Builder</button>
          <button role="tab" aria-selected={view === "formula"} className={view === "formula" ? "active" : ""} data-testid="calc-view-formula" onClick={() => setView("formula")}>Formula</button>
        </div>
      )}
      {view === "builder" && canBuild ? (
        <CalcBuilder expr={expr} candidates={candidates} onChange={(v) => patch(comp.id, { expression: v })} />
      ) : (
        <FormulaInput value={expr} candidates={candidates} onChange={(v) => patch(comp.id, { expression: v })} />
      )}
    </>
  );
}

// ------------------------------------------------------------------ format picker (no format strings exposed)
function FormatPicker({ comp, valueFormat = "format", patchTarget }: { comp: any; valueFormat?: string; patchTarget: (patch: Record<string, any>) => void }) {
  const spec = parseFormat(comp[valueFormat]);
  const set = (kind: string, arg: string) => patchTarget({ [valueFormat]: buildFormat({ kind: kind as any, arg }) });
  return (
    <div className="format-picker">
      <select aria-label="Format as" data-testid="format-kind" value={spec.kind} onChange={(e) => set(e.target.value, e.target.value === "currency" ? "" : e.target.value === "number" ? "2" : e.target.value === "date" ? "dd MMM yyyy" : "")}>
        <option value="">Plain</option>
        <option value="currency">Currency</option>
        <option value="number">Number</option>
        <option value="percent">Percent</option>
        <option value="date">Date</option>
      </select>
      {spec.kind === "currency" && (
        <select aria-label="Currency" value={spec.arg} onChange={(e) => set("currency", e.target.value)}>
          <option value="">Report default</option>
          {["INR", "USD", "EUR", "GBP", "AED", "JPY"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      )}
      {spec.kind === "number" && (
        <select aria-label="Decimal places" value={spec.arg} onChange={(e) => set("number", e.target.value)}>
          {["0", "1", "2", "3", "4"].map((d) => (
            <option key={d} value={d}>
              {d} decimals
            </option>
          ))}
        </select>
      )}
      {spec.kind === "date" && (
        <select aria-label="Date pattern" value={spec.arg} onChange={(e) => set("date", e.target.value)}>
          {["dd MMM yyyy", "dd/MM/yyyy", "yyyy-MM-dd", "MMMM yyyy", "dd MMM yyyy HH:mm"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ condition builder
function ConditionBuilder({ comp }: { comp: ops.Comp }) {
  const { doc, sample } = useStore();
  const patch = useStore((s) => s.patch);
  const expr: string = comp.visibleWhen ?? "";
  const cond = expr ? expressionToCondition(expr) : undefined;
  const [raw, setRaw] = useState(false);
  const candidates = useMemo(() => candidatesFor(doc, sample, comp.id), [doc, sample, comp.id]);
  const enabled = expr !== "";
  const showRaw = raw || (enabled && !cond);
  const setCond = (c: Condition) => patch(comp.id, { visibleWhen: conditionToExpression(c) });
  const current: Condition = cond ?? { field: candidates[0]?.value ?? "row.value", operator: "gt", value: "0" };

  return (
    <div className="condition">
      <label className="check">
        <input
          type="checkbox"
          data-testid="visible-when-toggle"
          checked={enabled}
          onChange={(e) => patch(comp.id, { visibleWhen: e.target.checked ? conditionToExpression(current) : undefined })}
        />
        Show this element only when...
      </label>
      {enabled && !showRaw && cond && (
        <div className="condition-row">
          <select aria-label="Condition field" data-testid="cond-field" value={cond.field} onChange={(e) => setCond({ ...cond, field: e.target.value })}>
            {!candidates.some((c) => c.value === cond.field) && <option>{cond.field}</option>}
            {candidates.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select aria-label="Condition operator" data-testid="cond-op" value={cond.operator} onChange={(e) => setCond({ ...cond, operator: e.target.value as Condition["operator"] })}>
            {OPERATORS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {cond.operator !== "empty" && cond.operator !== "notempty" && <input aria-label="Condition value" data-testid="cond-value" value={cond.value} onChange={(e) => setCond({ ...cond, value: e.target.value })} />}
        </div>
      )}
      {enabled && (
        <button className="link" onClick={() => setRaw(!showRaw)}>
          {showRaw ? "Use the simple builder" : "fx Edit as formula"}
        </button>
      )}
      {enabled && showRaw && <FormulaInput value={expr} candidates={candidates} placeholder="e.g. row.balance > 0" onChange={(v) => patch(comp.id, { visibleWhen: v })} />}
    </div>
  );
}

// ------------------------------------------------------------------ typography & style sections
function Typography({ comp }: { comp: ops.Comp }) {
  const patchStyle = useStore((s) => s.patchStyle);
  const st = comp.style ?? {};
  const doc = useStore((s) => s.doc);
  const bold = st.fontWeight === "bold" || (typeof st.fontWeight === "number" && st.fontWeight >= 600);
  const set = (p: Record<string, any>) => patchStyle(comp.id, p);
  return (
    <>
      <Field label="Font">
        <select aria-label="Font family" value={st.fontFamily ?? ""} onChange={(e) => set({ fontFamily: e.target.value || undefined })}>
          <option value="">{doc.theme?.fonts?.body ?? "Default"}</option>
          {["Noto Sans", "Noto Sans Devanagari", "Noto Sans Telugu", "Noto Sans Kannada", "Noto Sans Tamil", "Noto Sans Arabic"].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </Field>
      <div className="grid2">
        <Field label="Size">
          <Num label="Font size" value={st.fontSize} min={4} onChange={(v) => set({ fontSize: v })} />
        </Field>
        <Field label="Weight">
          <select aria-label="Font weight" value={bold ? "bold" : "normal"} onChange={(e) => set({ fontWeight: e.target.value === "bold" ? "bold" : undefined })}>
            <option value="normal">Regular</option>
            <option value="bold">Bold</option>
          </select>
        </Field>
      </div>
      <div className="btn-row">
        <button aria-pressed={!!st.italic} className={st.italic ? "on" : ""} aria-label="Italic" onClick={() => set({ italic: st.italic ? undefined : true })}>
          <i>I</i>
        </button>
        <button aria-pressed={!!st.underline} className={st.underline ? "on" : ""} aria-label="Underline" onClick={() => set({ underline: st.underline ? undefined : true })}>
          <u>U</u>
        </button>
        <button aria-pressed={!!st.strikethrough} className={st.strikethrough ? "on" : ""} aria-label="Strikethrough" onClick={() => set({ strikethrough: st.strikethrough ? undefined : true })}>
          <s>S</s>
        </button>
        <span className="sep" />
        {(["left", "center", "right", "justify"] as const).map((a) => (
          <button key={a} aria-label={`Align ${a}`} aria-pressed={st.align === a} className={st.align === a ? "on" : ""} data-testid={`align-${a}`} onClick={() => set({ align: st.align === a ? undefined : a })}>
            {a === "left" ? "⯇" : a === "center" ? "☰" : a === "right" ? "⯈" : "▤"}
          </button>
        ))}
      </div>
    </>
  );
}

function Appearance({ comp }: { comp: ops.Comp }) {
  const patchStyle = useStore((s) => s.patchStyle);
  const st = comp.style ?? {};
  const set = (p: Record<string, any>) => patchStyle(comp.id, p);
  const border = st.border && st.border.width !== undefined ? st.border : undefined;
  return (
    <>
      <div className="grid2">
        <Field label="Text color">
          <Color label="Text color" value={st.color} onChange={(v) => set({ color: v })} />
        </Field>
        <Field label="Background">
          <Color label="Background" value={st.background} onChange={(v) => set({ background: v })} />
        </Field>
      </div>
      <div className="grid2">
        <Field label="Padding">
          <Num label="Padding" min={0} value={typeof st.padding === "number" ? st.padding : undefined} onChange={(v) => set({ padding: v })} />
        </Field>
        <Field label="Border">
          <Num label="Border width" min={0} step={0.5} value={border?.width} onChange={(v) => set({ border: v ? { width: v, style: "solid", color: border?.color ?? "#000000" } : undefined })} />
        </Field>
      </div>
      {border && (
        <Field label="Border color">
          <Color label="Border color" value={border.color} onChange={(v) => set({ border: { ...border, color: v ?? "#000000" } })} />
        </Field>
      )}
    </>
  );
}

function Advanced({ comp }: { comp: ops.Comp }) {
  const patch = useStore((s) => s.patch);
  return (
    <Section title="Advanced" open={false}>
      <ConditionBuilder comp={comp} />
      <label className="check">
        <input type="checkbox" data-testid="flag-bookmark" checked={!!comp.bookmark} onChange={(e) => patch(comp.id, { bookmark: e.target.checked ? true : undefined })} />
        PDF bookmark (shows in the PDF outline / navigation pane)
      </label>
      <div className="group-title small">Overflow</div>
      <Field label="When text is too long">
        <select aria-label="Overflow" value={comp.style?.overflow ?? ""} onChange={(e) => useStore.getState().patchStyle(comp.id, { overflow: e.target.value || undefined })}>
          <option value="">Wrap onto more lines</option>
          <option value="ellipsis">Truncate with ...</option>
          <option value="hidden">Clip</option>
        </select>
      </Field>
    </Section>
  );
}

// ------------------------------------------------------------------ type-specific panels
function TextProps({ comp }: { comp: ops.Comp }) {
  const patch = useStore((s) => s.patch);
  return (
    <>
      <Section title="Content">
        <ValueEditor comp={comp} />
        <Field label="Format as" wide>
          <FormatPicker comp={comp} patchTarget={(p) => patch(comp.id, p)} />
        </Field>
      </Section>
      <Section title="Typography">
        <Typography comp={comp} />
      </Section>
      <Section title="Appearance" open={false}>
        <Appearance comp={comp} />
      </Section>
    </>
  );
}

function ColumnEditor({ table, col, index }: { table: ops.Comp; col: any; index: number }) {
  const { doc, sample } = useStore();
  const patch = useStore((s) => s.patch);
  const candidates = useMemo(() => candidatesFor(doc, sample, table.id, table.dataset), [doc, sample, table.id, table.dataset]);
  const [open, setOpen] = useState(false);
  const mode: ValueMode = col.expression !== undefined ? "formula" : "field";
  const update = (p: Record<string, any>) => patch(table.id, { columns: table.columns.map((c: any, i: number) => (i === index ? { ...c, ...p } : c)) }, `col:${table.id}:${index}`);
  const move = (d: number) => {
    const cols = [...table.columns];
    const j = index + d;
    if (j < 0 || j >= cols.length) return;
    [cols[index], cols[j]] = [cols[j], cols[index]];
    patch(table.id, { columns: cols });
  };
  return (
    <div className="column-card" data-testid={`column-${index}`}>
      <div className="column-head">
        <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "▾" : "▸"} {col.header || "(untitled)"}
        </button>
        <span className="spacer" />
        <button className="mini" aria-label="Move column left" onClick={() => move(-1)}>↑</button>
        <button className="mini" aria-label="Move column right" onClick={() => move(1)}>↓</button>
        <button className="mini danger" aria-label="Remove column" onClick={() => patch(table.id, { columns: table.columns.filter((_: any, i: number) => i !== index) })}>×</button>
      </div>
      {open && (
        <div className="column-body">
          <Field label="Header">
            <input aria-label="Column header" value={col.header ?? ""} onChange={(e) => update({ header: e.target.value })} />
          </Field>
          <div className="seg small">
            {(["field", "formula"] as const).map((m) => (
              <button key={m} className={mode === m ? "active" : ""} onClick={() => update(m === "field" ? { binding: col.binding ?? col.expression ?? "row.value", expression: undefined } : { expression: col.expression ?? col.binding ?? "row.value", binding: undefined })}>
                {m === "field" ? "Field" : "fx Formula"}
              </button>
            ))}
          </div>
          {mode === "field" ? (
            <select aria-label="Column field" value={col.binding ?? ""} onChange={(e) => update({ binding: e.target.value })}>
              {!candidates.some((c) => c.value === col.binding) && <option value={col.binding ?? ""}>{col.binding}</option>}
              {candidates.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          ) : (
            <FormulaInput value={col.expression ?? ""} candidates={candidates} onChange={(v) => update({ expression: v })} testId={`column-formula-${index}`} />
          )}
          <Field label="Format" wide>
            <FormatPicker comp={col} patchTarget={update} />
          </Field>
          <div className="grid2">
            <Field label="Width">
              <Dim label="Column width" value={col.width} placeholder="auto (*)" onChange={(v) => update({ width: v })} />
            </Field>
            <Field label="Align">
              <select aria-label="Column align" value={col.align ?? ""} onChange={(e) => update({ align: e.target.value || undefined })}>
                <option value="">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </Field>
          </div>
          <Field label="Total in footer">
            <select
              aria-label="Footer total"
              value={col.footer?.aggregate ?? ""}
              onChange={(e) => {
                update({ footer: e.target.value ? { aggregate: e.target.value } : undefined });
                if (e.target.value && !table.showFooter) patch(table.id, { showFooter: true });
              }}
            >
              <option value="">None</option>
              {["sum", "avg", "min", "max", "count"].map((a) => (
                <option key={a} value={a}>
                  {titleCase(a)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </div>
  );
}

function TableProps({ comp }: { comp: ops.Comp }) {
  const { doc, sample } = useStore();
  const patch = useStore((s) => s.patch);
  const refs = arrayRefs(doc, sample);
  const flag = (key: string, label: string, def = false) => (
    <label className="check" key={key}>
      <input type="checkbox" data-testid={`flag-${key}`} checked={comp[key] ?? def} onChange={(e) => patch(comp.id, { [key]: e.target.checked })} />
      {label}
    </label>
  );
  const generate = () => {
    const rows = datasetValue(doc, sample, comp.dataset);
    const fields = inferFields(rows).filter((f) => f.kind !== "array" && f.kind !== "object");
    patch(comp.id, {
      columns: fields.slice(0, 10).map((f) => ({
        id: f.name,
        header: titleCase(f.name),
        binding: `row.${f.path}`,
        format: f.kind === "date" ? "date:dd MMM yyyy" : f.kind === "number" && /amount|price|total|rate|cost|balance/i.test(f.name) ? "currency" : undefined,
        align: f.kind === "number" ? "right" : undefined,
      })),
    });
  };
  return (
    <>
      <Section title="Data">
        <Field label="Dataset">
          <select aria-label="Table dataset" data-testid="table-dataset" value={comp.dataset ?? ""} onChange={(e) => patch(comp.id, { dataset: e.target.value })}>
            <option value="">Choose...</option>
            {comp.dataset && !refs.includes(comp.dataset) && <option value={comp.dataset}>{comp.dataset}</option>}
            {refs.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <button className="btn" data-testid="generate-columns" onClick={generate} disabled={!comp.dataset}>
          Generate columns from data
        </button>
      </Section>
      <Section title={`Columns (${comp.columns?.length ?? 0})`}>
        {(comp.columns ?? []).map((c: any, i: number) => (
          <ColumnEditor key={i} table={comp} col={c} index={i} />
        ))}
        <button className="btn" data-testid="add-column" onClick={() => patch(comp.id, { columns: [...(comp.columns ?? []), { id: `col-${(comp.columns ?? []).length + 1}`, header: "New column", binding: "row.value" }] })}>
          + Add column
        </button>
      </Section>
      <Section title="Pagination & rows">
        {flag("showHeader", "Show header", true)}
        {flag("repeatHeaderOnPageBreak", "Repeat header on every page", true)}
        {flag("showFooter", "Show totals row")}
        {flag("keepRowTogether", "Never split a row across pages", true)}
        {flag("alternateRowStyle", "Zebra stripes")}
        <div className="grid2">
          <Field label="Min rows before break">
            <Num label="Min rows before break" min={0} value={comp.minRowsBeforeBreak} onChange={(v) => patch(comp.id, { minRowsBeforeBreak: v })} />
          </Field>
          <Field label="Min rows after break">
            <Num label="Min rows after break" min={0} value={comp.minRowsAfterBreak} onChange={(v) => patch(comp.id, { minRowsAfterBreak: v })} />
          </Field>
        </div>
      </Section>
      <Section title="Typography" open={false}>
        <Typography comp={comp} />
      </Section>
    </>
  );
}

const SHEET_PRESETS: { label: string; cfg: Record<string, number>; margin: { top: number; left: number } }[] = [
  { label: "A4 · 2 × 4 (99.1 × 67.7 mm)", cfg: { columns: 2, rows: 4, labelWidth: 99.1, labelHeight: 67.7, gapX: 2.5, gapY: 0 }, margin: { top: 13, left: 4.7 } },
  { label: "A4 · 3 × 7 (63.5 × 38.1 mm)", cfg: { columns: 3, rows: 7, labelWidth: 63.5, labelHeight: 38.1, gapX: 2.5, gapY: 0 }, margin: { top: 15.1, left: 7.2 } },
  { label: "A4 · 2 × 7 (99.1 × 38.1 mm)", cfg: { columns: 2, rows: 7, labelWidth: 99.1, labelHeight: 38.1, gapX: 2.5, gapY: 0 }, margin: { top: 15.1, left: 4.7 } },
  { label: "A4 · 3 × 8 (70 × 36 mm)", cfg: { columns: 3, rows: 8, labelWidth: 70, labelHeight: 36, gapX: 0, gapY: 0 }, margin: { top: 4.5, left: 0 } },
  { label: "A4 · 4 equal (105 × 148.5 mm)", cfg: { columns: 2, rows: 2, labelWidth: 105, labelHeight: 148.5, gapX: 0, gapY: 0 }, margin: { top: 0, left: 0 } },
  { label: "A4 · 5 × 13 (38.1 × 21.2 mm)", cfg: { columns: 5, rows: 13, labelWidth: 38.1, labelHeight: 21.2, gapX: 2.5, gapY: 0 }, margin: { top: 10.7, left: 8.5 } },
];

/** Sticker/label sheet setup: grid, label size, gaps, start position, and a fit check against the page. */
function LabelSheetProps({ comp }: { comp: ops.Comp }) {
  const { doc } = useStore();
  const patch = useStore((s) => s.patch);
  const setDoc = useStore((s) => s.setDoc);
  const engine = useStore((s) => s.engine);
  const pag = engine.paginated;
  const mmFromPt = (v: number) => (v * 25.4) / 72;
  const gx = comp.gapX ?? 0;
  const gy = comp.gapY ?? 0;
  const sheetW = comp.columns * comp.labelWidth + (comp.columns - 1) * gx;
  const sheetH = comp.rows * comp.labelHeight + (comp.rows - 1) * gy;
  const pageW = pag ? mmFromPt(pag.pageSize.width - pag.margin.left - pag.margin.right) : undefined;
  const pageH = pag ? mmFromPt(pag.pageSize.height - pag.margin.top - pag.margin.bottom) : undefined;
  const fits = pageW === undefined || (sheetW <= pageW + 0.05 && sheetH <= (pageH ?? 0) + 0.05);
  const num = (key: string, label: string, min = 0, step = 0.1) => (
    <Field label={label}>
      <Num label={label} min={min} step={step} value={comp[key]} onChange={(v) => patch(comp.id, { [key]: v })} />
    </Field>
  );
  return (
    <Section title="Label sheet">
      <Field label="Sheet type" wide>
        <select
          aria-label="Sheet preset"
          data-testid="sheet-preset"
          value=""
          onChange={(e) => {
            const p = SHEET_PRESETS[Number(e.target.value)];
            if (!p) return;
            const next = ops.update(doc, comp.id, { ...p.cfg });
            setDoc({ ...next, page: { ...(next.page ?? {}), size: "A4", orientation: "portrait", unit: "mm", margin: { top: p.margin.top, left: p.margin.left, right: 0, bottom: 0 } } });
          }}
        >
          <option value="">Choose a label stock…</option>
          {SHEET_PRESETS.map((p, i) => (
            <option key={p.label} value={i}>{p.label}</option>
          ))}
        </select>
      </Field>
      <div className="grid2">
        {num("columns", "Columns", 1, 1)}
        {num("rows", "Rows", 1, 1)}
        {num("labelWidth", "Label width (mm)", 1)}
        {num("labelHeight", "Label height (mm)", 1)}
        {num("gapX", "Gap across (mm)")}
        {num("gapY", "Gap down (mm)")}
      </div>
      <Field label="Start at position">
        <Num label="Start position" min={1} value={comp.startPosition ?? 1} onChange={(v) => patch(comp.id, { startPosition: v && v > 1 ? v : undefined })} />
      </Field>
      <Field label="Fill" wide>
        <select
          aria-label="Fill mode"
          data-testid="sheet-fill"
          value={comp.dataset ? "records" : "copies"}
          onChange={(e) => patch(comp.id, e.target.value === "records" ? { dataset: (doc.datasets ?? [])[0]?.id ?? "", copies: undefined } : { dataset: undefined, copies: comp.copies ?? comp.columns * comp.rows })}
        >
          <option value="copies">Repeat the same label</option>
          <option value="records">One label per record</option>
        </select>
      </Field>
      {comp.dataset !== undefined && (
        <Field label="Dataset" wide>
          <select aria-label="Sheet dataset" value={comp.dataset} onChange={(e) => patch(comp.id, { dataset: e.target.value })}>
            {(doc.datasets ?? []).map((d: any) => (
              <option key={d.id}>{d.id}</option>
            ))}
          </select>
        </Field>
      )}
      {comp.dataset === undefined && num("copies", "Number of labels", 1, 1)}
      <label className="check">
        <input type="checkbox" data-testid="sheet-outlines" checked={!!comp.outlines} onChange={(e) => patch(comp.id, { outlines: e.target.checked ? true : undefined })} />
        Draw label outlines (alignment test on plain paper)
      </label>
      <div className={`print-facts ${fits ? "" : "bad"}`} data-testid="sheet-facts">
        <div>Sheet area <strong>{sheetW.toFixed(1)} × {sheetH.toFixed(1)} mm</strong>{pageW !== undefined && <> of {pageW.toFixed(1)} × {pageH!.toFixed(1)} mm printable</>}</div>
        <div>{comp.columns * comp.rows} labels per sheet{comp.dataset === undefined && comp.copies ? ` · ${Math.ceil((comp.copies + Math.max(0, (comp.startPosition ?? 1) - 1)) / (comp.columns * comp.rows))} sheet(s)` : ""}</div>
        {!fits && <div className="field-error">The labels do not fit on the page. Check the page margins and label size.</div>}
      </div>
      <p className="muted small">Design ONE label by dropping elements into this sheet. Printers need “Actual size” (no scaling) for the labels to line up.</p>
    </Section>
  );
}

function ChartProps({ comp }: { comp: ops.Comp }) {
  const { doc, sample } = useStore();
  const patch = useStore((s) => s.patch);
  const refs = arrayRefs(doc, sample);
  const candidates = candidatesFor(doc, sample, comp.id, comp.dataset);
  const series: any[] = comp.series ?? [];
  const setSeries = (s: any[]) => patch(comp.id, { series: s });
  return (
    <Section title="Chart">
      <Field label="Type">
        <select aria-label="Chart type" value={comp.chartType} onChange={(e) => patch(comp.id, { chartType: e.target.value })}>
          <option value="bar">Bar</option>
          <option value="line">Line</option>
          <option value="pie">Pie</option>
        </select>
      </Field>
      <Field label="Title">
        <input aria-label="Chart title" value={comp.title ?? ""} onChange={(e) => patch(comp.id, { title: e.target.value || undefined })} />
      </Field>
      <Field label="Dataset">
        <select aria-label="Chart dataset" value={comp.dataset ?? ""} onChange={(e) => patch(comp.id, { dataset: e.target.value })}>
          <option value="">Choose...</option>
          {refs.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Field>
      <Field label="Category">
        <select aria-label="Category field" value={comp.categoryBinding ?? ""} onChange={(e) => patch(comp.id, { categoryBinding: e.target.value })}>
          <option value="">Row number</option>
          {candidates.filter((c) => c.value.startsWith("row.")).map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      {series.map((s, i) => (
        <div className="series-row" key={i}>
          <input aria-label="Series name" value={s.name} onChange={(e) => setSeries(series.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <select aria-label="Series field" value={s.binding ?? ""} onChange={(e) => setSeries(series.map((x, j) => (j === i ? { ...x, binding: e.target.value } : x)))}>
            <option value="">Field...</option>
            {candidates.filter((c) => c.value.startsWith("row.")).map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <button className="mini danger" aria-label="Remove series" onClick={() => setSeries(series.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button className="btn" onClick={() => setSeries([...series, { name: `Series ${series.length + 1}`, binding: candidates.find((c) => c.kind === "number" && c.value.startsWith("row."))?.value }])}>
        + Add series
      </button>
    </Section>
  );
}

function CodeProps({ comp }: { comp: ops.Comp }) {
  const patch = useStore((s) => s.patch);
  return (
    <Section title={comp.type === "qrcode" ? "QR code" : "Barcode"}>
      <ValueEditor comp={comp} />
      {comp.type === "barcode" && (
        <Field label="Symbology">
          <select aria-label="Symbology" value={comp.symbology ?? "code128"} onChange={(e) => patch(comp.id, { symbology: e.target.value })}>
            {["code128", "code39", "ean13", "upc"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      )}
    </Section>
  );
}

function ImageProps({ comp }: { comp: ops.Comp }) {
  const patch = useStore((s) => s.patch);
  return (
    <Section title="Image">
      <Field label="Source (URL or data)">
        <input aria-label="Image source" value={comp.src?.startsWith("data:") ? "(embedded image)" : comp.src ?? ""} onChange={(e) => patch(comp.id, { src: e.target.value })} />
      </Field>
      <label className="btn file">
        Upload image
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => patch(comp.id, { src: String(r.result) });
            r.readAsDataURL(f);
          }}
        />
      </label>
      <Field label="Fit">
        <select aria-label="Image fit" value={comp.fit ?? "contain"} onChange={(e) => patch(comp.id, { fit: e.target.value })}>
          {["contain", "cover", "fill", "stretch", "fit"].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </Field>
    </Section>
  );
}

function SpacingEditor({ comp, prop, label }: { comp: ops.Comp; prop: "margin" | "padding"; label: string }) {
  const patchStyle = useStore((s) => s.patchStyle);
  const raw = comp.style?.[prop];
  const edges = typeof raw === "number" ? { top: raw, right: raw, bottom: raw, left: raw } : { top: 0, right: 0, bottom: 0, left: 0, ...(raw ?? {}) };
  const set = (side: "top" | "right" | "bottom" | "left", v: number | undefined) => {
    const next = { ...edges, [side]: v ?? 0 };
    patchStyle(comp.id, { [prop]: Object.values(next).every((x) => x === 0) ? undefined : next });
  };
  return (
    <div className="spacing">
      <span className="field-label">{label}</span>
      <div className="grid4">
        {(["top", "right", "bottom", "left"] as const).map((side) => (
          <input key={side} type="number" min={0} aria-label={`${label} ${side}`} title={side} placeholder={side[0]!.toUpperCase()} value={edges[side] || ""} onChange={(e) => set(side, e.target.value === "" ? undefined : Number(e.target.value))} />
        ))}
      </div>
    </div>
  );
}

function LayoutProps({ comp }: { comp: ops.Comp }) {
  const patch = useStore((s) => s.patch);
  const isContainer = ["container", "row", "column", "grid", "repeater", "keepTogether"].includes(comp.type);
  const absolute = typeof comp.x === "number" || typeof comp.y === "number";
  const parentLayout = ops.parentLayout(useStore.getState().doc, comp.id);
  const flag = (key: string, label: string) => (
    <label className="check" key={key}>
      <input type="checkbox" data-testid={`flag-${key}`} checked={!!comp[key]} onChange={(e) => patch(comp.id, { [key]: e.target.checked ? true : undefined })} />
      {label}
    </label>
  );
  return (
    <>
      <Section title="Layout">
        {isContainer && (
          <Field label="Arrange children">
            <select aria-label="Layout" value={comp.layout ?? (comp.type === "row" ? "row" : comp.type === "grid" ? "grid" : "flow")} onChange={(e) => patch(comp.id, { layout: e.target.value })}>
              <option value="flow">Stacked (flow)</option>
              <option value="row">Side by side (row)</option>
              <option value="grid">Grid</option>
              <option value="absolute">Free position (absolute)</option>
            </select>
          </Field>
        )}
        {comp.type === "grid" && (
          <Field label="Columns">
            <Num label="Grid columns" min={1} value={comp.columns} onChange={(v) => patch(comp.id, { columns: v ?? 1 })} />
          </Field>
        )}
        {comp.type === "repeater" && (
          <Field label="Dataset">
            <select aria-label="Repeater dataset" value={comp.dataset ?? ""} onChange={(e) => patch(comp.id, { dataset: e.target.value })}>
              <option value="">Choose...</option>
              {arrayRefs(useStore.getState().doc, useStore.getState().sample).map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
        )}
        {isContainer && (
          <>
            <div className="grid2">
              <Field label="Gap">
                <Num label="Gap between children" min={0} value={comp.gap} onChange={(v) => patch(comp.id, { gap: v })} />
              </Field>
              <Field label="Align items">
                <select aria-label="Align items" value={comp.alignItems ?? ""} onChange={(e) => patch(comp.id, { alignItems: e.target.value || undefined })}>
                  <option value="">Default</option>
                  {["start", "center", "end", "stretch"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Distribute">
              <select aria-label="Justify content" value={comp.justifyContent ?? ""} onChange={(e) => patch(comp.id, { justifyContent: e.target.value || undefined })}>
                <option value="">Default</option>
                {["start", "center", "end", "space-between", "space-around"].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Field>
          </>
        )}
        <div className="grid2">
          <Field label="Width">
            <Dim label="Width" value={comp.width} onChange={(v) => patch(comp.id, { width: v })} />
          </Field>
          <Field label="Height">
            <Dim label="Height" value={comp.height} onChange={(v) => patch(comp.id, { height: v })} />
          </Field>
        </div>
        {absolute && (
          <div className="grid2">
            <Field label="X">
              <Num label="X position" value={typeof comp.x === "number" ? comp.x : undefined} onChange={(v) => patch(comp.id, { x: v })} />
            </Field>
            <Field label="Y">
              <Num label="Y position" value={typeof comp.y === "number" ? comp.y : undefined} onChange={(v) => patch(comp.id, { y: v })} />
            </Field>
          </div>
        )}
        {!absolute && parentLayout === "absolute" && <button className="btn" onClick={() => patch(comp.id, { x: 0, y: 0 })}>Position freely</button>}
        {!absolute && parentLayout === "absolute" ? null : absolute && (
          <button className="btn" onClick={() => patch(comp.id, { x: undefined, y: undefined })}>Return to flow</button>
        )}
        <SpacingEditor comp={comp} prop="margin" label="Margin" />
        <SpacingEditor comp={comp} prop="padding" label="Padding" />
        {parentLayout === "row" && (
          <Field label="Grow (share extra width)">
            <Num label="Grow" min={0} value={comp.grow} onChange={(v) => patch(comp.id, { grow: v })} />
          </Field>
        )}
      </Section>
      <Section title="Size limits" open={false}>
        <div className="grid2">
          <Field label="Min width"><Dim label="Min width" value={comp.minWidth} onChange={(v) => patch(comp.id, { minWidth: v })} /></Field>
          <Field label="Max width"><Dim label="Max width" value={comp.maxWidth} onChange={(v) => patch(comp.id, { maxWidth: v })} /></Field>
          <Field label="Min height"><Dim label="Min height" value={comp.minHeight} onChange={(v) => patch(comp.id, { minHeight: v })} /></Field>
          <Field label="Max height"><Dim label="Max height" value={comp.maxHeight} onChange={(v) => patch(comp.id, { maxHeight: v })} /></Field>
        </div>
      </Section>
      <Section title="Page breaks" open={false}>
        {flag("keepTogether", "Keep together (never split across pages)")}
        {flag("keepWithNext", "Keep with next element")}
        {comp.type === "text" && (
          <div className="grid2">
            <Field label="Min lines at top"><Num label="Minimum lines at top of page" min={0} value={comp.minLinesAtTop} onChange={(v) => patch(comp.id, { minLinesAtTop: v })} /></Field>
            <Field label="Min lines at bottom"><Num label="Minimum lines at bottom of page" min={0} value={comp.minLinesAtBottom} onChange={(v) => patch(comp.id, { minLinesAtBottom: v })} /></Field>
          </div>
        )}
        {flag("pageBreakBefore", "Start on a new page")}
        {flag("pageBreakAfter", "Page break after")}
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ page masters
const MASTER_ROWS: { kind: ops.MasterKind; label: string; hint: string }[] = [
  { kind: "first", label: "First page", hint: "Letterhead on page 1, compact header afterwards" },
  { kind: "standard", label: "Standard pages", hint: "Used on every page without a more specific master" },
  { kind: "last", label: "Last page", hint: "Totals / signature footer on the final page" },
  { kind: "odd", label: "Odd pages", hint: "Mirrored layouts for double-sided printing" },
  { kind: "even", label: "Even pages", hint: "Mirrored layouts for double-sided printing" },
];

function PageMasters() {
  const { doc } = useStore();
  const setDoc = useStore((s) => s.setDoc);
  const select = useStore((s) => s.select);
  const set = useStore((s) => s.set);
  const has = (type: "pageHeader" | "pageFooter", kind: ops.MasterKind) =>
    (doc.sections ?? []).findIndex((x: any) => x.type === type && (kind === "standard" ? !x.appliesTo || x.appliesTo === "all" || x.appliesTo === "standard" : x.appliesTo === kind));
  const open = (index: number) => {
    const first = (doc.sections?.[index]?.children ?? [])[0];
    set({ leftTab: "layers", leftOpen: true });
    if (first) select([first.id]);
  };
  return (
    <Section title="Headers & footers" open={false}>
      <p className="muted small">Different headers and footers per page type, like a word processor — without duplicating the report.</p>
      {(["pageHeader", "pageFooter"] as const).map((type) => (
        <div key={type} className="masters" data-testid={`masters-${type}`}>
          <div className="group-title small">{type === "pageHeader" ? "Header" : "Footer"}</div>
          {MASTER_ROWS.map((r) => {
            const idx = has(type, r.kind);
            return (
              <div key={r.kind} className="master-row" title={r.hint}>
                <span className={idx >= 0 ? "" : "muted"}>{r.label}</span>
                <span className="spacer" />
                {idx >= 0 ? (
                  <>
                    <button className="mini" data-testid={`master-open-${type}-${r.kind}`} onClick={() => open(idx)}>Edit</button>
                    {r.kind !== "standard" && (
                      <button className="mini danger" aria-label={`Remove ${r.label} ${type}`} data-testid={`master-remove-${type}-${r.kind}`} onClick={() => setDoc(ops.removeSection(doc, idx))}>×</button>
                    )}
                  </>
                ) : (
                  <>
                    <button className="mini" data-testid={`master-add-${type}-${r.kind}`} title="Start from a copy of the standard one" onClick={() => setDoc(ops.addMaster(doc, type, r.kind))}>+ Copy</button>
                    <button className="mini" data-testid={`master-hide-${type}-${r.kind}`} title="Show nothing on these pages" onClick={() => setDoc(ops.addMaster(doc, type, r.kind, true))}>Hide</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </Section>
  );
}

const PRINT_PRESETS: { label: string; profile: Record<string, unknown>; page?: Record<string, unknown> }[] = [
  { label: "Office printer (A4)", profile: { printerType: "document", language: "pdf", dpi: 300, safeMargin: 5 } },
  { label: "Thermal receipt 80 mm", profile: { printerType: "receipt", language: "pdf", dpi: 203, safeMargin: 2 }, page: { size: "custom", width: 80, height: 200, unit: "mm", orientation: "portrait" } },
  { label: "Thermal receipt 58 mm", profile: { printerType: "receipt", language: "pdf", dpi: 203, safeMargin: 2 }, page: { size: "custom", width: 58, height: 200, unit: "mm", orientation: "portrait" } },
  { label: "Label 50 × 30 mm (ZPL 203 dpi)", profile: { printerType: "label", language: "zpl", dpi: 203, safeMargin: 1.5 }, page: { size: "custom", width: 50, height: 30, unit: "mm", orientation: "landscape" } },
  { label: "Label 100 × 50 mm (ZPL 300 dpi)", profile: { printerType: "label", language: "zpl", dpi: 300, safeMargin: 2 }, page: { size: "custom", width: 100, height: 50, unit: "mm", orientation: "landscape" } },
  { label: "Wristband 25 × 250 mm (ZPL)", profile: { printerType: "wristband", language: "zpl", dpi: 300, safeMargin: 1 }, page: { size: "custom", width: 25, height: 250, unit: "mm", orientation: "portrait" } },
];

function PrintProfilePanel() {
  const { doc, engine } = useStore();
  const setDoc = useStore((s) => s.setDoc);
  const print = doc.print;
  const pag = engine.paginated;
  const mm = (pt: number) => (pt * 25.4) / 72;
  const dpi = print?.dpi ?? 203;
  const set = (p: Record<string, unknown>) => setDoc({ ...doc, print: { ...(doc.print ?? {}), ...p } }, { coalesce: "print" });
  return (
    <Section title="Print & labels" open={!!print}>
      <Field label="Preset" wide>
        <select
          aria-label="Print preset"
          data-testid="print-preset"
          value=""
          onChange={(e) => {
            const preset = PRINT_PRESETS[Number(e.target.value)];
            if (!preset) return;
            setDoc({ ...doc, print: { ...(doc.print ?? {}), ...preset.profile }, page: preset.page ? { ...(doc.page ?? {}), ...preset.page, margin: { top: 2, right: 2, bottom: 2, left: 2 } } : doc.page });
          }}
        >
          <option value="">Choose a printer / media…</option>
          {PRINT_PRESETS.map((p, i) => (
            <option key={p.label} value={i}>{p.label}</option>
          ))}
        </select>
      </Field>
      <div className="grid2">
        <Field label="Printer type">
          <select aria-label="Printer type" value={print?.printerType ?? ""} onChange={(e) => set({ printerType: e.target.value || undefined })}>
            <option value="">Not set</option>
            {["document", "label", "receipt", "card", "wristband"].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </Field>
        <Field label="Language">
          <select aria-label="Printer language" value={print?.language ?? ""} onChange={(e) => set({ language: e.target.value || undefined })}>
            <option value="">PDF</option>
            <option value="zpl">ZPL</option>
            <option value="escpos">ESC/POS</option>
          </select>
        </Field>
        <Field label="Resolution (dpi)">
          <select aria-label="DPI" data-testid="print-dpi" value={print?.dpi ?? ""} onChange={(e) => set({ dpi: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">Default</option>
            {[152, 203, 300, 600].map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </Field>
        <Field label="Safe margin (mm)">
          <Num label="Safe margin" min={0} step={0.5} value={print?.safeMargin} onChange={(v) => set({ safeMargin: v })} />
        </Field>
      </div>
      {pag && (
        <div className="print-facts" data-testid="print-facts">
          <div>Physical size <strong>{mm(pag.pageSize.width).toFixed(1)} × {mm(pag.pageSize.height).toFixed(1)} mm</strong></div>
          <div>
            At {dpi} dpi <strong>{Math.round((mm(pag.pageSize.width) / 25.4) * dpi)} × {Math.round((mm(pag.pageSize.height) / 25.4) * dpi)} dots</strong>
          </div>
          {print?.safeMargin ? <div>Keep content {print.safeMargin} mm from the edge (shown on the canvas)</div> : null}
        </div>
      )}
      {print && (
        <button className="btn" onClick={() => setDoc({ ...doc, print: undefined })}>
          Remove print profile
        </button>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ page / report panel (nothing selected)
function PageProps() {
  const { doc } = useStore();
  const setDoc = useStore((s) => s.setDoc);
  const page = doc.page ?? {};
  const margin = page.margin ?? { top: 15, right: 15, bottom: 18, left: 15 };
  const setPage = (p: Record<string, any>) => setDoc({ ...doc, page: { ...page, ...p } }, { coalesce: "page" });
  const setTheme = (p: Record<string, any>) => setDoc({ ...doc, theme: { ...(doc.theme ?? {}), ...p } }, { coalesce: "theme" });
  return (
    <>
      <div className="prop-head">
        <strong>Report</strong>
        <span className="muted small">Select an element to edit it</span>
      </div>
      <Section title="Report">
        <Field label="Name">
          <input aria-label="Report name" data-testid="report-name" value={doc.name ?? ""} onChange={(e) => setDoc({ ...doc, name: e.target.value }, { coalesce: "name" })} />
        </Field>
        <Field label="Id">
          <input aria-label="Report id" value={doc.id ?? ""} onChange={(e) => setDoc({ ...doc, id: e.target.value.replace(/[^a-z0-9-_]/gi, "-").toLowerCase() }, { coalesce: "id" })} />
        </Field>
        <Field label="Description">
          <input aria-label="Description" value={doc.description ?? ""} onChange={(e) => setDoc({ ...doc, description: e.target.value }, { coalesce: "desc" })} />
        </Field>
      </Section>
      <Section title="Page">
        <div className="grid2">
          <Field label="Size">
            <select aria-label="Page size" data-testid="page-size" value={page.size ?? "A4"} onChange={(e) => setPage({ size: e.target.value, ...(e.target.value === "custom" && !page.width ? { width: 100, height: 150, unit: "mm" } : {}) })}>
              {["A4", "A3", "A5", "Letter", "Legal", "custom"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Orientation">
            <select aria-label="Orientation" data-testid="page-orientation" value={page.orientation ?? "portrait"} onChange={(e) => setPage({ orientation: e.target.value })}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </Field>
        </div>
        {page.size === "custom" && (
          <div className="grid3">
            <Field label="Width">
              <Num label="Page width" value={page.width} onChange={(v) => setPage({ width: v })} />
            </Field>
            <Field label="Height">
              <Num label="Page height" value={page.height} onChange={(v) => setPage({ height: v })} />
            </Field>
            <Field label="Unit">
              <select aria-label="Unit" value={page.unit ?? "mm"} onChange={(e) => setPage({ unit: e.target.value })}>
                {["mm", "cm", "in", "pt", "px"].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <div className="grid4">
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <Field key={side} label={titleCase(side)}>
              <Num label={`Margin ${side}`} min={0} value={margin[side]} onChange={(v) => setPage({ margin: { ...margin, [side]: v ?? 0 } })} />
            </Field>
          ))}
        </div>
      </Section>
      <Section title="Watermark" open={!!doc.watermark}>
        <Field label="Text" wide>
          <input aria-label="Watermark text" data-testid="watermark-text" placeholder="DRAFT, CONFIDENTIAL, COPY…" value={doc.watermark?.text ?? ""} onChange={(e) => setDoc({ ...doc, watermark: e.target.value ? { ...(doc.watermark ?? {}), text: e.target.value } : undefined }, { coalesce: "wm" })} />
        </Field>
        {doc.watermark && (
          <div className="grid2">
            <Field label="Opacity">
              <Num label="Watermark opacity" min={0} step={0.05} value={doc.watermark.opacity ?? 0.18} onChange={(v) => setDoc({ ...doc, watermark: { ...doc.watermark, opacity: Math.min(1, v ?? 0.18) } }, { coalesce: "wm" })} />
            </Field>
            <Field label="Pages">
              <select aria-label="Watermark pages" value={doc.watermark.pages ?? "all"} onChange={(e) => setDoc({ ...doc, watermark: { ...doc.watermark, pages: e.target.value } })}>
                <option value="all">Every page</option>
                <option value="first">First page</option>
              </select>
            </Field>
          </div>
        )}
        <p className="muted small">Shown in Preview and exports (PDF, HTML).</p>
      </Section>
      <PageMasters />
      <PrintProfilePanel />
      <Section title="Locale & theme" open={false}>
        <Field label="Locale">
          <input aria-label="Locale" value={doc.locale ?? ""} placeholder="en-US" onChange={(e) => setDoc({ ...doc, locale: e.target.value || undefined }, { coalesce: "locale" })} />
        </Field>
        <Field label="Currency">
          <input aria-label="Currency" value={doc.theme?.currency ?? ""} placeholder="USD" onChange={(e) => setTheme({ currency: e.target.value || undefined })} />
        </Field>
        <Field label="Body font">
          <input aria-label="Body font" value={doc.theme?.fonts?.body ?? ""} placeholder="Noto Sans" onChange={(e) => setTheme({ fonts: { ...(doc.theme?.fonts ?? {}), body: e.target.value || undefined } })} />
        </Field>
      </Section>
    </>
  );
}

function MultiProps({ ids }: { ids: string[] }) {
  const { doc } = useStore();
  const setDoc = useStore((s) => s.setDoc);
  const btn = (label: string, fn: () => void, testId?: string) => (
    <button className="btn" data-testid={testId} onClick={fn}>
      {label}
    </button>
  );
  return (
    <>
      <div className="prop-head">
        <strong>{ids.length} elements selected</strong>
      </div>
      <Section title="Align (free-positioned elements)">
        <div className="btn-grid">
          {(["left", "center", "right", "top", "middle", "bottom"] as const).map((m) => btn(`Align ${m}`, () => setDoc(ops.align(doc, ids, m)), `align-${m}`))}
        </div>
        <div className="btn-grid">
          {btn("Distribute horizontally", () => setDoc(ops.distribute(doc, ids, "horizontal")), "distribute-h")}
          {btn("Distribute vertically", () => setDoc(ops.distribute(doc, ids, "vertical")), "distribute-v")}
        </div>
      </Section>
      <Section title="Actions">
        <div className="btn-grid">
          {btn("Duplicate", () => useStore.getState().duplicateSelected())}
          {btn("Delete", () => useStore.getState().removeSelected())}
        </div>
      </Section>
    </>
  );
}

function ComponentProps({ id }: { id: string }) {
  const { doc } = useStore();
  const loc = ops.find(doc, id);
  if (!loc) return <PageProps />;
  const comp = loc.comp;
  const t = comp.type;
  return (
    <>
      <div className="prop-head">
        <Icon name={t === "chart" ? `chart-${comp.chartType}` : t} />
        <input className="name-input" data-testid="component-name" aria-label="Element name" placeholder={ops.layerName({ ...comp, name: undefined })} value={comp.name ?? ""} onChange={(e) => useStore.getState().rename(comp.id, e.target.value)} />
        <span className="muted small">{t}</span>
        <span className="spacer" />
        <button className="mini" data-testid="open-in-code" title="Open this element in the code editor" onClick={() => useStore.getState().openCode(comp.id)}>
          {"</>"}
        </button>
        <button className="mini" aria-label="Duplicate" onClick={() => useStore.getState().duplicateSelected()}>
          ⧉
        </button>
        <button className="mini danger" aria-label="Delete" data-testid="delete-selected" onClick={() => useStore.getState().removeSelected()}>
          🗑
        </button>
      </div>
      {(t === "text" || t === "richText" || t === "field") && <TextProps comp={comp} />}
      {t === "table" && <TableProps comp={comp} />}
      {t === "chart" && <ChartProps comp={comp} />}
      {t === "labelSheet" && <LabelSheetProps comp={comp} />}
      {(t === "qrcode" || t === "barcode") && <CodeProps comp={comp} />}
      {t === "image" && <ImageProps comp={comp} />}
      {(t === "rectangle" || t === "container" || t === "row" || t === "column" || t === "grid") && (
        <Section title="Appearance" open={t === "rectangle"}>
          <Appearance comp={comp} />
        </Section>
      )}
      {t !== "pageBreak" && t !== "line" && t !== "labelSheet" && <LayoutProps comp={comp} />}
      {t === "group" && (
        <Section title="Grouping">
          <Field label="Group by (expression)">
            <FormulaInput value={comp.groupBy ?? ""} candidates={candidatesFor(doc, useStore.getState().sample, comp.id, comp.dataset)} onChange={(v) => useStore.getState().patch(comp.id, { groupBy: v })} />
          </Field>
        </Section>
      )}
      {t !== "pageBreak" && <Advanced comp={comp} />}
    </>
  );
}

export function Properties() {
  const selection = useStore((s) => s.selection);
  return (
    <aside className="panel right" aria-label="Properties" data-testid="properties">
      {selection.length === 0 && <PageProps />}
      {selection.length === 1 && <ComponentProps id={selection[0]!} />}
      {selection.length > 1 && <MultiProps ids={selection} />}
    </aside>
  );
}
