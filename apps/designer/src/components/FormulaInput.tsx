import { useMemo, useRef, useState } from "react";
import { FUNCTION_CANDIDATES, type Candidate } from "../lib/bindings";
import { checkExpression, describeFormula } from "../lib/lowcode";

/** Shared expression editor for components and report bands. */
export function FormulaInput({ value, onChange, candidates, placeholder, testId }: { value: string; onChange: (v: string) => void; candidates: Candidate[]; placeholder?: string; testId?: string }) {
  const [focus, setFocus] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
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
        <textarea
          ref={ref}
          data-testid={testId ?? "formula-input"}
          className="mono"
          aria-label="Formula"
          aria-invalid={!!error}
          placeholder={placeholder ?? "e.g. row.quantity * row.rate or an if/return block"}
          value={value}
          rows={value.includes("\n") ? Math.min(8, Math.max(3, value.split("\n").length)) : 2}
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
