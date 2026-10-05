import { useStore } from "../store";
import type * as ops from "../model/ops";
import { arrayRefs } from "../lib/fields";
import { candidatesFor, type Candidate } from "../lib/bindings";
import { InspectorSection as Section } from "./InspectorSection";
import { Field } from "./Properties";

interface Dimension {
  binding: string;
  header?: string;
  sort?: "asc" | "desc";
}

interface Measure {
  binding: string;
  aggregate?: "sum" | "count" | "avg" | "min" | "max";
  header?: string;
  format?: string;
}

const AGGREGATES: [Measure["aggregate"], string][] = [["sum", "Sum"], ["count", "Count"], ["avg", "Average"], ["min", "Minimum"], ["max", "Maximum"]];

function FieldSelect({ label, value, fields, onChange }: { label: string; value: string; fields: Candidate[]; onChange: (value: string) => void }) {
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Field…</option>
      {fields.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
    </select>
  );
}

function DimensionList({ title, dimensions, fields, onChange, min }: { title: string; dimensions: Dimension[]; fields: Candidate[]; onChange: (next: Dimension[]) => void; min: number }) {
  const set = (index: number, change: Partial<Dimension>) => onChange(dimensions.map((dimension, i) => (i === index ? { ...dimension, ...change } : dimension)));
  return (
    <div className="crosstab-list" role="group" aria-label={title}>
      <div className="crosstab-list-title">{title}</div>
      {dimensions.map((dimension, index) => (
        <div className="series-row" key={index}>
          <FieldSelect label={`${title} field ${index + 1}`} value={dimension.binding} fields={fields} onChange={(binding) => set(index, { binding })} />
          <button className="mini" aria-label={`Sort ${dimension.sort === "desc" ? "ascending" : "descending"}`} title="Sort order" onClick={() => set(index, { sort: dimension.sort === "desc" ? "asc" : "desc" })}>{dimension.sort === "desc" ? "Z→A" : "A→Z"}</button>
          <button className="mini danger" aria-label={`Remove ${title.toLowerCase()} field ${index + 1}`} disabled={dimensions.length <= min} onClick={() => onChange(dimensions.filter((_, i) => i !== index))}>×</button>
        </div>
      ))}
      <button className="btn" onClick={() => onChange([...dimensions, { binding: fields.find((field) => field.kind !== "number")?.value ?? "" }])}>+ Add {title.toLowerCase()} field</button>
    </div>
  );
}

/** Inspector for a crosstab: data, the fields down the side and across the top, the values, and totals. */
export function CrosstabProps({ comp }: { comp: ops.Comp }) {
  const { doc, sample } = useStore();
  const patch = useStore((s) => s.patch);
  const refs = arrayRefs(doc, sample);
  const fields = candidatesFor(doc, sample, comp.id, comp.dataset).filter((candidate) => candidate.value.startsWith("row."));
  const measures: Measure[] = comp.measures ?? [];
  // Picking data for an unconfigured crosstab fills in a sensible start: two text fields and a sum.
  const suggest = (dataset: string): Record<string, unknown> => {
    const configured = [...(comp.rows ?? []), ...(comp.columns ?? []), ...measures].some((part: { binding?: string }) => part.binding);
    if (configured || !dataset) return {};
    const options = candidatesFor(doc, sample, comp.id, dataset).filter((candidate) => candidate.value.startsWith("row."));
    const text = options.filter((candidate) => candidate.kind !== "number" && candidate.kind !== "array" && candidate.kind !== "object");
    const number = options.find((candidate) => candidate.kind === "number");
    return {
      rows: [{ binding: text[0]?.value ?? "" }],
      columns: text[1] ? [{ binding: text[1].value }] : [],
      measures: [number ? { binding: number.value, aggregate: "sum" } : { binding: text[0]?.value ?? "", aggregate: "count" }],
    };
  };
  const setMeasure = (index: number, change: Partial<Measure>) => patch(comp.id, { measures: measures.map((measure, i) => (i === index ? { ...measure, ...change } : measure)) });
  return (
    <Section title="Crosstab">
      <Field label="Dataset">
        <select aria-label="Crosstab dataset" value={comp.dataset ?? ""} onChange={(event) => patch(comp.id, { dataset: event.target.value, ...suggest(event.target.value) })}>
          <option value="">Choose…</option>
          {refs.map((ref) => <option key={ref}>{ref}</option>)}
        </select>
      </Field>
      <DimensionList title="Rows" dimensions={comp.rows ?? []} fields={fields} min={1} onChange={(rows) => patch(comp.id, { rows })} />
      <DimensionList title="Columns" dimensions={comp.columns ?? []} fields={fields} min={0} onChange={(columns) => patch(comp.id, { columns })} />
      <div className="crosstab-list" role="group" aria-label="Values">
        <div className="crosstab-list-title">Values</div>
        {measures.map((measure, index) => (
          <div className="series-row" key={index}>
            <select aria-label={`Value ${index + 1} calculation`} value={measure.aggregate ?? "sum"} onChange={(event) => setMeasure(index, { aggregate: event.target.value as Measure["aggregate"] })}>
              {AGGREGATES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <FieldSelect label={`Value ${index + 1} field`} value={measure.binding} fields={fields} onChange={(binding) => setMeasure(index, { binding })} />
            <button className="mini danger" aria-label={`Remove value ${index + 1}`} disabled={measures.length <= 1} onClick={() => patch(comp.id, { measures: measures.filter((_, i) => i !== index) })}>×</button>
          </div>
        ))}
        <button className="btn" onClick={() => patch(comp.id, { measures: [...measures, { binding: fields.find((field) => field.kind === "number")?.value ?? "", aggregate: "sum" }] })}>+ Add value</button>
      </div>
      <label className="check"><input type="checkbox" aria-label="Total column" checked={comp.totalColumn !== false} onChange={(event) => patch(comp.id, { totalColumn: event.target.checked })} /> Total column</label>
      <label className="check"><input type="checkbox" aria-label="Total row" checked={comp.totalRow !== false} onChange={(event) => patch(comp.id, { totalRow: event.target.checked })} /> Total row</label>
      <Field label="Total label">
        <input aria-label="Total label" value={comp.totalLabel ?? "Total"} onChange={(event) => patch(comp.id, { totalLabel: event.target.value || undefined })} />
      </Field>
    </Section>
  );
}
