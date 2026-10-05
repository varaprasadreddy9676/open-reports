import { useStore } from "../store";
import type * as ops from "../model/ops";
import { InspectorSection as Section } from "./InspectorSection";
import { Field } from "./Properties";

type Kind = "none" | "url" | "expression" | "report";

interface Link {
  url?: string;
  expression?: string;
  report?: string;
  parameters?: Record<string, string>;
}

const kindOf = (link: Link | undefined): Kind => (link?.report !== undefined ? "report" : link?.expression !== undefined ? "expression" : link?.url !== undefined ? "url" : "none");

/** Make an element clickable: a web address, one computed per record, or a drill-through to another report. */
export function LinkProps({ comp }: { comp: ops.Comp }) {
  const patch = useStore((s) => s.patch);
  const link: Link | undefined = comp.link;
  const kind = kindOf(link);
  const set = (next: Link | undefined) => patch(comp.id, { link: next });
  const parameters = Object.entries(link?.parameters ?? {});
  return (
    <Section title="Link" open={kind !== "none"} summary={kind === "none" ? "None" : kind === "report" ? `Opens ${link?.report || "a report"}` : "Web link"}>
      <Field label="When clicked">
        <select aria-label="Link type" value={kind} onChange={(event) => {
          const next = event.target.value as Kind;
          set(next === "none" ? undefined : next === "url" ? { url: "https://" } : next === "expression" ? { expression: "" } : { report: "", parameters: {} });
        }}>
          <option value="none">Nothing</option>
          <option value="url">Open a web address</option>
          <option value="expression">Open a web address from data</option>
          <option value="report">Open another report (drill-through)</option>
        </select>
      </Field>
      {kind === "url" && <Field label="Address"><input aria-label="Link address" placeholder="https://example.com" value={link?.url ?? ""} onChange={(event) => set({ url: event.target.value })} /></Field>}
      {kind === "expression" && <Field label="Formula"><input aria-label="Link formula" placeholder={'"https://track.example.com/" + row.awb'} value={link?.expression ?? ""} onChange={(event) => set({ expression: event.target.value })} /></Field>}
      {kind === "report" && (
        <>
          <Field label="Report id"><input aria-label="Drill-through report" placeholder="invoice" value={link?.report ?? ""} onChange={(event) => set({ ...link, report: event.target.value })} /></Field>
          {parameters.map(([name, expression], index) => (
            <div className="series-row" key={index}>
              <input aria-label={`Parameter ${index + 1} name`} placeholder="invoiceId" value={name} onChange={(event) => set({ ...link, parameters: Object.fromEntries(parameters.map(([key, value], i) => (i === index ? [event.target.value, value] : [key, value]))) })} />
              <input aria-label={`Parameter ${index + 1} value`} placeholder="row.id" value={expression} onChange={(event) => set({ ...link, parameters: Object.fromEntries(parameters.map(([key, value], i) => (i === index ? [key, event.target.value] : [key, value]))) })} />
              <button className="mini danger" aria-label={`Remove parameter ${index + 1}`} onClick={() => set({ ...link, parameters: Object.fromEntries(parameters.filter((_, i) => i !== index)) })}>×</button>
            </div>
          ))}
          <button className="btn" onClick={() => set({ ...link, parameters: { ...(link?.parameters ?? {}), [`param${parameters.length + 1}`]: "row.id" } })}>+ Add parameter</button>
          <p className="muted small">Opens in the report viewer. PDFs leave drill-through links out.</p>
        </>
      )}
    </Section>
  );
}
