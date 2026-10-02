type Side = "top" | "right" | "bottom" | "left";
type Edges = Record<Side, number>;
export type SpacingValue = number | Edges | undefined;

const sides: Side[] = ["top", "right", "bottom", "left"];

/** One spacing control for both component and band inspectors. Values stay in report points. */
export function SpacingFields({ label, value, onChange, testId }: { label: string; value: SpacingValue; onChange: (next: Edges | undefined) => void; testId?: string }) {
  const edges: Edges = typeof value === "number"
    ? { top: value, right: value, bottom: value, left: value }
    : { top: 0, right: 0, bottom: 0, left: 0, ...(value ?? {}) };
  const set = (side: Side, raw: string) => {
    const next = { ...edges, [side]: raw === "" ? 0 : Number(raw) };
    onChange(sides.every((key) => next[key] === 0) ? undefined : next);
  };
  return <div className="spacing">
    <span className="field-label">{label}</span>
    <div className="grid4">
      {sides.map((side) => <input key={side} type="number" min={0} aria-label={`${label} ${side}`} data-testid={testId ? `${testId}-${side}` : undefined} title={side} placeholder={side[0]!.toUpperCase()} value={edges[side] || ""} onChange={(event) => set(side, event.target.value)} />)}
    </div>
  </div>;
}
