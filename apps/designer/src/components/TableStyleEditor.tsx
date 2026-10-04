import { useStore } from "../store";
import type { Comp } from "../model/ops";

type Part = "header" | "body" | "alternateRow" | "footer";
const PARTS: { id: Part; label: string }[] = [
  { id: "header", label: "Header" }, { id: "body", label: "Body" }, { id: "alternateRow", label: "Stripes (every second row)" }, { id: "footer", label: "Footer" },
];
const LINES = [
  { id: "none", label: "No lines" }, { id: "header", label: "Under the header" }, { id: "horizontal", label: "Between rows" }, { id: "all", label: "Full grid" },
];

const clean = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== ""));

/** Table appearance: a theme preset, grid lines, and colours/weight per section. Size and spacing stay on the table so page breaks do not change. */
export function TableStyleEditor({ table }: { table: Comp }) {
  const doc = useStore((s) => s.doc);
  const presets = Object.keys(doc.theme?.tableStyles ?? {});
  const colors = Object.entries((doc.theme?.colors ?? {}) as Record<string, string>);
  const styles: Record<string, any> = table.styles ?? {};
  const patch = (next: Record<string, unknown> | undefined) => useStore.getState().patch(table.id, { styles: next && Object.keys(next).length ? next : undefined }, `table-style:${table.id}`);
  const setPart = (part: Part, key: string, value: unknown) => {
    const updated = clean({ ...(styles[part] ?? {}), [key]: value });
    patch(clean({ ...styles, [part]: Object.keys(updated).length ? updated : undefined }));
  };
  const setGrid = (key: string, value: unknown) => {
    const updated = clean({ ...(styles.grid ?? {}), [key]: value });
    patch(clean({ ...styles, grid: Object.keys(updated).length ? updated : undefined }));
  };
  const saveAsPreset = () => {
    const name = window.prompt("Name for the table style preset", "table-1")?.trim();
    const s = useStore.getState();
    if (!name) return;
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name) || s.doc.theme?.tableStyles?.[name]) { s.toast(`"${name}" is not a valid new preset name.`, "error"); return; }
    const theme = { ...(s.doc.theme ?? {}), tableStyles: { ...(s.doc.theme?.tableStyles ?? {}), [name]: styles } };
    s.setDoc({ ...s.doc, theme });
    s.patch(table.id, { tableStyle: name, styles: undefined });
  };
  const colourControl = (label: string, value: string | undefined, onChange: (v: string | undefined) => void) => <span className="color">
    <input type="color" aria-label={label} value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : value?.startsWith("$") && /^#[0-9a-f]{6}$/i.test((doc.theme?.colors as any)?.[value.slice(1)] ?? "") ? (doc.theme?.colors as any)[value.slice(1)] : "#000000"} onChange={(e) => onChange(e.target.value)} />
    <input aria-label={`${label} value`} placeholder="default" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)} />
    {colors.length > 0 && <select aria-label={`${label} theme colour`} value={value?.startsWith("$") ? value : ""} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">Theme…</option>
      {colors.map(([name, colour]) => <option key={name} value={`$${name}`}>{`$${name} ${colour}`}</option>)}
    </select>}
  </span>;

  return <div className="table-style-editor" data-testid="table-style-editor">
    <label className="field"><span className="field-label">Preset</span>
      <span className="row-inline">
        <select aria-label="Table style preset" data-testid="table-style-preset" value={table.tableStyle ?? ""} onChange={(e) => useStore.getState().patch(table.id, { tableStyle: e.target.value || undefined })}>
          <option value="">None</option>
          {presets.map((name) => <option key={name} value={name}>{name}</option>)}
          {table.tableStyle && !presets.includes(table.tableStyle) && <option value={table.tableStyle}>{table.tableStyle} (missing)</option>}
        </select>
        <button className="mini" data-testid="table-style-save-preset" disabled={!table.styles} title="Save these settings as a theme preset and use it here" onClick={saveAsPreset}>Save as preset</button>
      </span>
    </label>
    <p className="muted small">Settings below override the preset. Font size and padding are set on the table itself, so styling never moves a page break.</p>
    <fieldset className="table-style-part">
      <legend>Lines</legend>
      <select aria-label="Grid lines" data-testid="table-grid-lines" value={styles.grid?.lines ?? ""} onChange={(e) => setGrid("lines", e.target.value || undefined)}>
        <option value="">{table.tableStyle ? "From preset" : "Under the header (default)"}</option>
        {LINES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      {colourControl("Line colour", styles.grid?.color, (v) => setGrid("color", v))}
      <input type="number" min={0} max={5} step={0.25} aria-label="Line width in points" value={styles.grid?.width ?? ""} placeholder="0.5" onChange={(e) => setGrid("width", e.target.value === "" ? undefined : Number(e.target.value))} />
    </fieldset>
    {PARTS.map((part) => {
      const value: Record<string, any> = styles[part.id] ?? {};
      return <fieldset key={part.id} className="table-style-part" data-testid={`table-style-${part.id}`}>
        <legend>{part.label}</legend>
        {colourControl(`${part.label} text colour`, value.color, (v) => setPart(part.id, "color", v))}
        {colourControl(`${part.label} background`, value.background, (v) => setPart(part.id, "background", v))}
        <select aria-label={`${part.label} weight`} value={value.fontWeight ?? ""} onChange={(e) => setPart(part.id, "fontWeight", e.target.value || undefined)}>
          <option value="">Default weight</option><option value="normal">Regular</option><option value="bold">Bold</option>
        </select>
        <label className="check"><input type="checkbox" aria-label={`${part.label} italic`} checked={!!value.italic} onChange={(e) => setPart(part.id, "italic", e.target.checked || undefined)} />Italic</label>
      </fieldset>;
    })}
  </div>;
}
