import { useRef, useState } from "react";
import type { PositionedNode } from "@reporting/layout";
import { useStore } from "../store";
import { pointsPerRulerUnit } from "../lib/ruler";

type Side = "top" | "right" | "bottom" | "left";
const SIDES: Side[] = ["top", "right", "bottom", "left"];

function paddingOf(style: Record<string, unknown> | undefined): Record<Side, number> {
  const padding = style?.padding;
  if (typeof padding === "number") return { top: padding, right: padding, bottom: padding, left: padding };
  const sides = (padding && typeof padding === "object" ? padding : {}) as Partial<Record<Side, number>>;
  return { top: Number(sides.top) || 0, right: Number(sides.right) || 0, bottom: Number(sides.bottom) || 0, left: Number(sides.left) || 0 };
}

const snap = (value: number, free: boolean) => Math.max(0, free ? Math.round(value * 10) / 10 : Math.round(value * 2) / 2);

/** True for containers whose children are laid out automatically along an axis. */
export function isAutoLayout(component: Record<string, unknown>): "row" | "column" | null {
  const layout = component.layout as string | undefined;
  if (component.type === "row" && !layout) return "row";
  if (layout === "row") return "row";
  if (["container", "column", "row"].includes(component.type as string) && (!layout || layout === "flow" || layout === "column")) return "column";
  return null;
}

/**
 * Direct manipulation for auto-layout containers: drag between children to set the gap, drag an inner edge to set
 * that side's padding (Shift: every side). Values snap to 0.5 pt; Alt places freely. Each drag is one undo step.
 */
export function AutoLayoutHandles({ node, k }: { node: PositionedNode; k: number }) {
  const component = node.component as Record<string, any>;
  const axis = isAutoLayout(component);
  const rulerUnit = useStore((s) => s.rulerUnit);
  const dpi = useStore((s) => s.doc.print?.dpi ?? 203);
  const [active, setActive] = useState<string | null>(null);
  const drag = useRef<{ start: number; value: number; kind: "gap" | Side; all: boolean; key: string } | null>(null);
  if (!axis || !component.id) return null;
  const id = component.id as string;
  const children = [...(node.children ?? [])].sort((a, b) => (axis === "row" ? a.box.x - b.box.x : a.box.y - b.box.y));
  const padding = paddingOf(component.style);
  const gap = typeof component.gap === "number" ? component.gap : 0;
  const unit = (pt: number) => `${Math.round((pt / pointsPerRulerUnit(rulerUnit, dpi)) * 10) / 10} ${rulerUnit}`;

  const begin = (event: React.PointerEvent, kind: "gap" | Side) => {
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const horizontal = kind === "gap" ? axis === "row" : kind === "left" || kind === "right";
    // A fresh key per drag makes each drag exactly one undo step.
    drag.current = { start: horizontal ? event.clientX : event.clientY, value: kind === "gap" ? gap : padding[kind], kind, all: event.shiftKey, key: `${kind}:${id}:${Date.now()}` };
    setActive(kind);
  };
  const move = (event: React.PointerEvent) => {
    const current = drag.current;
    if (!current) return;
    event.stopPropagation();
    const horizontal = current.kind === "gap" ? axis === "row" : current.kind === "left" || current.kind === "right";
    const delta = ((horizontal ? event.clientX : event.clientY) - current.start) / k;
    const s = useStore.getState();
    if (current.kind === "gap") {
      s.patch(id, { gap: snap(current.value + delta, event.altKey) }, current.key);
    } else {
      // Dragging an edge inwards grows the padding on that side.
      const inward = current.kind === "left" || current.kind === "top" ? delta : -delta;
      const next = snap(current.value + inward, event.altKey);
      s.patchStyle(id, { padding: current.all ? next : { ...padding, [current.kind]: next } }, current.key);
    }
  };
  const end = (event: React.PointerEvent) => {
    if (!drag.current) return;
    event.stopPropagation();
    drag.current = null;
    setActive(null);
  };
  const box = node.box;
  const handleProps = (kind: "gap" | Side) => ({ onPointerDown: (e: React.PointerEvent) => begin(e, kind), onPointerMove: move, onPointerUp: end, onPointerCancel: end, onClick: (e: React.MouseEvent) => e.stopPropagation() });

  return <>
    {children.slice(0, -1).map((child, index) => {
      const next = children[index + 1]!;
      const style: React.CSSProperties = axis === "row"
        ? { left: ((child.box.x + child.box.width + next.box.x) / 2 - box.x) * k - 3, top: (Math.max(child.box.y, next.box.y) - box.y) * k, width: 6, height: Math.max(12, Math.min(child.box.height, next.box.height) * k) }
        : { top: ((child.box.y + child.box.height + next.box.y) / 2 - box.y) * k - 3, left: (Math.max(child.box.x, next.box.x) - box.x) * k, height: 6, width: Math.max(12, Math.min(child.box.width, next.box.width) * k) };
      return <span key={`gap-${index}`} className={`al-handle al-gap ${axis}`} style={style} data-testid={`gap-handle-${index}`} title={`Gap ${unit(gap)} — drag to change`} {...handleProps("gap")}>
        {active === "gap" && index === 0 && <span className="al-label" data-testid="al-label">gap {unit(gap)}</span>}
      </span>;
    })}
    {SIDES.map((side) => {
      const style: React.CSSProperties = side === "left" ? { left: padding.left * k - 2, top: "25%", height: "50%", width: 4 }
        : side === "right" ? { right: padding.right * k - 2, top: "25%", height: "50%", width: 4 }
        : side === "top" ? { top: padding.top * k - 2, left: "25%", width: "50%", height: 4 }
        : { bottom: padding.bottom * k - 2, left: "25%", width: "50%", height: 4 };
      return <span key={side} className={`al-handle al-padding ${side}`} style={style} data-testid={`padding-handle-${side}`} title={`Padding ${side} ${unit(padding[side])} — drag; Shift for all sides`} {...handleProps(side)}>
        {active === side && <span className="al-label" data-testid="al-label">padding {unit(padding[side])}</span>}
      </span>;
    })}
  </>;
}
