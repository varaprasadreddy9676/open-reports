import { useId, type ReactNode, type KeyboardEvent } from "react";

interface InspectorTab<Id extends string> { id: Id; label: string }

/** Shared, keyboard-operable navigation for contextual inspector views. */
export function InspectorTabs<Id extends string>({ label, tabs, active, onChange, testIdPrefix, children }: {
  label: string;
  tabs: readonly InspectorTab<Id>[];
  active: Id;
  onChange: (id: Id) => void;
  testIdPrefix?: string;
  children: ReactNode;
}) {
  const base = useId();
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!offset && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + offset + tabs.length) % tabs.length;
    const tablist = event.currentTarget.parentElement;
    onChange(tabs[next]!.id);
    requestAnimationFrame(() => tablist?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus());
  };
  return <>
    <div className="inspector-tabs" role="tablist" aria-label={label} style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" id={`${base}-${tab.id}`} aria-controls={`${base}-panel`} aria-selected={active === tab.id} tabIndex={active === tab.id ? 0 : -1} data-testid={testIdPrefix ? `${testIdPrefix}-${tab.id}` : undefined} onClick={() => onChange(tab.id)} onKeyDown={(event) => move(event, index)}>{tab.label}</button>)}
    </div>
    <div className="inspector-tab-panel" id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-${active}`}>{children}</div>
  </>;
}
