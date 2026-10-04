import { useState } from "react";
import { resolveStyleTokens } from "@reporting/core";
import { useStore } from "../store";
import type { Doc } from "../model/ops";
import { countTableStyleUses, countTextStyleUses, countTokenUses, renameTableStyle, renameTextStyle, renameToken, TOKEN_NAME, type TokenCategory } from "../lib/theme-edit";

type Tab = TokenCategory | "textStyles" | "tableStyles";
const TABS: { id: Tab; label: string; noun: string }[] = [
  { id: "colors", label: "Colours", noun: "colour" },
  { id: "fonts", label: "Fonts", noun: "font" },
  { id: "fontSizes", label: "Font sizes", noun: "size" },
  { id: "spacing", label: "Spacing", noun: "spacing" },
  { id: "textStyles", label: "Text styles", noun: "text style" },
  { id: "tableStyles", label: "Table styles", noun: "table style" },
];
const DEFAULTS: Record<Tab, unknown> = { colors: "#1d4ed8", fonts: "Noto Sans", fontSizes: 10, spacing: 8, textStyles: { fontSize: 10 }, tableStyles: { header: { background: "#e5e7eb" }, grid: { lines: "horizontal" } } };

function uniqueName(existing: Record<string, unknown>, base: string): string {
  let n = 1;
  while (`${base}-${n}` in existing) n++;
  return `${base}-${n}`;
}

/** Name field that renames on blur or Enter, refusing invalid or duplicate names. */
function NameInput({ name, taken, onRename, label }: { name: string; taken: string[]; onRename: (next: string) => void; label: string }) {
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState("");
  const commit = () => {
    if (draft === name) return setError("");
    if (!TOKEN_NAME.test(draft)) return setError("Use letters, digits, - or _, starting with a letter.");
    if (taken.includes(draft)) return setError(`"${draft}" already exists.`);
    setError("");
    onRename(draft);
  };
  return <span className="theme-name">
    <span className="theme-sigil" aria-hidden="true">$</span>
    <input aria-label={label} aria-invalid={Boolean(error)} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(name); setError(""); } }} />
    {error && <span className="field-error small" role="alert">{error}</span>}
  </span>;
}

function DeleteButton({ uses, onDelete, label }: { uses: number; onDelete: () => void; label: string }) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) return <button className="mini danger" aria-label={`Confirm delete ${label}`} onClick={onDelete} onBlur={() => setConfirming(false)} autoFocus>Used {uses}× — delete?</button>;
  return <button className="mini danger" aria-label={`Delete ${label}`} onClick={() => (uses ? setConfirming(true) : onDelete())}>×</button>;
}

export function ThemeDialogBody() {
  const { doc, setDoc, set } = useStore();
  const [tab, setTab] = useState<Tab>("colors");
  const theme = (doc.theme ?? {}) as Record<string, any>;
  const table: Record<string, any> = theme[tab] ?? {};
  const save = (next: Doc) => setDoc(next, { coalesce: "theme" });
  const setValue = (name: string, value: unknown) => save({ ...doc, theme: { ...theme, [tab]: { ...table, [name]: value } } });
  const remove = (name: string) => save({ ...doc, theme: { ...theme, [tab]: Object.fromEntries(Object.entries(table).filter(([key]) => key !== name)) } });
  const rename = (from: string, to: string) => save(tab === "textStyles" ? renameTextStyle(doc, from, to) : tab === "tableStyles" ? renameTableStyle(doc, from, to) : renameToken(doc, tab, from, to));
  const uses = (name: string) => (tab === "textStyles" ? countTextStyleUses(doc, name) : tab === "tableStyles" ? countTableStyleUses(doc, name) : countTokenUses(doc, tab, name));
  const add = () => setValue(uniqueName(table, tab === "textStyles" ? "style" : tab === "tableStyles" ? "table" : TABS.find((t) => t.id === tab)!.noun.replace(" ", "-")), DEFAULTS[tab]);
  const tokens = (category: TokenCategory) => Object.keys(theme[category] ?? {});
  const noun = TABS.find((t) => t.id === tab)!.noun;

  return <div className="theme-dialog" data-testid="theme-dialog">
    <h2>Theme</h2>
    <p className="muted small">Define reusable values once and reference them as <code>$name</code>. Renaming updates every use in this report.</p>
    <div className="seg" role="tablist" aria-label="Theme sections">
      {TABS.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} data-testid={`theme-tab-${item.id}`} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </div>
    <div className="theme-rows" data-testid={`theme-${tab}`}>
      {Object.keys(table).length === 0 && <p className="muted small">No {noun}s yet.</p>}
      {Object.entries(table).map(([name, value]) => <div className="theme-row" key={name} data-testid={`theme-row-${name}`}>
        <NameInput key={name} name={name} label={`${noun} name`} taken={Object.keys(table).filter((key) => key !== name)} onRename={(next) => rename(name, next)} />
        {tab === "colors" && <span className="color">
          <input type="color" aria-label={`${name} colour`} value={/^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : "#000000"} onChange={(e) => setValue(name, e.target.value)} />
          <input aria-label={`${name} colour value`} value={String(value)} onChange={(e) => setValue(name, e.target.value)} />
        </span>}
        {tab === "fonts" && <input aria-label={`${name} font family`} value={String(value)} onChange={(e) => setValue(name, e.target.value)} />}
        {(tab === "fontSizes" || tab === "spacing") && <input type="number" min={tab === "fontSizes" ? 1 : 0} step="any" aria-label={`${name} ${tab === "fontSizes" ? "size" : "spacing"} in points`} value={Number(value)} onChange={(e) => e.target.value !== "" && setValue(name, Number(e.target.value))} />}
        {tab === "textStyles" && <TextStyleEditor style={value} fonts={tokens("fonts")} sizes={tokens("fontSizes")} colors={tokens("colors")} onChange={(next) => setValue(name, next)} />}
        {tab === "textStyles" && <span className="theme-preview" data-testid={`theme-preview-${name}`} style={previewStyle(value, theme)}>The quick brown fox</span>}
        {tab === "tableStyles" && <span className="muted small">Edit a preset from a table's Style tab, then save it as a preset.</span>}
        <span className="muted small">{uses(name)} use{uses(name) === 1 ? "" : "s"}</span>
        <DeleteButton uses={uses(name)} label={name} onDelete={() => remove(name)} />
      </div>)}
    </div>
    <div className="modal-actions">
      <button className="btn" data-testid="theme-add" onClick={add}>+ Add {noun}</button>
      <span className="spacer" />
      <button className="btn primary" data-testid="theme-done" onClick={() => set({ dialog: null })}>Done</button>
    </div>
  </div>;
}

function previewStyle(style: Record<string, unknown>, theme: Record<string, any>): React.CSSProperties {
  const resolved = resolveStyleTokens(style, theme) ?? {};
  return {
    fontFamily: resolved.fontFamily as string | undefined,
    fontSize: typeof resolved.fontSize === "number" ? `${resolved.fontSize}pt` : undefined,
    fontWeight: resolved.fontWeight as React.CSSProperties["fontWeight"],
    fontStyle: resolved.italic ? "italic" : undefined,
    color: resolved.color as string | undefined,
  };
}

function TextStyleEditor({ style, fonts, sizes, colors, onChange }: { style: Record<string, any>; fonts: string[]; sizes: string[]; colors: string[]; onChange: (style: Record<string, unknown>) => void }) {
  const set = (key: string, value: unknown) => onChange(Object.fromEntries(Object.entries({ ...style, [key]: value }).filter(([, v]) => v !== undefined && v !== "")));
  return <span className="theme-text-style">
    <select aria-label="Text style font" value={style.fontFamily ?? ""} onChange={(e) => set("fontFamily", e.target.value || undefined)}>
      <option value="">Default font</option>
      {fonts.map((name) => <option key={name} value={`$${name}`}>${name}</option>)}
    </select>
    <select aria-label="Text style size" value={typeof style.fontSize === "string" ? style.fontSize : ""} onChange={(e) => set("fontSize", e.target.value || undefined)}>
      <option value="">{typeof style.fontSize === "number" ? `${style.fontSize} pt` : "Size"}</option>
      {sizes.map((name) => <option key={name} value={`$${name}`}>${name}</option>)}
    </select>
    <select aria-label="Text style weight" value={style.fontWeight === "bold" ? "bold" : "normal"} onChange={(e) => set("fontWeight", e.target.value === "bold" ? "bold" : undefined)}>
      <option value="normal">Regular</option><option value="bold">Bold</option>
    </select>
    <label className="check"><input type="checkbox" aria-label="Text style italic" checked={!!style.italic} onChange={(e) => set("italic", e.target.checked || undefined)} />Italic</label>
    <select aria-label="Text style colour" value={typeof style.color === "string" && style.color.startsWith("$") ? style.color : ""} onChange={(e) => set("color", e.target.value || undefined)}>
      <option value="">{typeof style.color === "string" && !style.color.startsWith("$") ? style.color : "Colour"}</option>
      {colors.map((name) => <option key={name} value={`$${name}`}>${name}</option>)}
    </select>
  </span>;
}
