/** 1pt = 4/3 CSS px, matching the 96-CSS-px-per-inch assumption @reporting/layout
 * uses when converting "px" dimensions to points (see packages/layout/src/units.ts). */
export function ptToPx(pt: number): number {
  return pt * (4 / 3);
}

export function cssBox(box: { x: number; y: number; width: number; height: number }): string {
  return `position:absolute;left:${ptToPx(box.x).toFixed(2)}px;top:${ptToPx(box.y).toFixed(2)}px;width:${ptToPx(box.width).toFixed(2)}px;height:${ptToPx(box.height).toFixed(2)}px;`;
}

const FIT_TO_OBJECT_FIT: Record<string, string> = {
  fit: "contain",
  fill: "fill",
  contain: "contain",
  cover: "cover",
  stretch: "fill",
};

export function objectFitFor(fit: string): string {
  return FIT_TO_OBJECT_FIT[fit] ?? "contain";
}

export function styleToCss(style: Record<string, unknown> | undefined): string {
  if (!style) return "";
  const out: string[] = [];
  const s = style as Record<string, any>;
  if (s.fontFamily) out.push(`font-family:${s.fontFamily}`);
  if (s.fontSize) out.push(`font-size:${ptToPx(s.fontSize)}px`);
  if (s.fontWeight) out.push(`font-weight:${s.fontWeight === "bold" ? 700 : s.fontWeight === "normal" ? 400 : s.fontWeight}`);
  if (s.italic) out.push("font-style:italic");
  if (s.underline && s.strikethrough) out.push("text-decoration:underline line-through");
  else if (s.underline) out.push("text-decoration:underline");
  else if (s.strikethrough) out.push("text-decoration:line-through");
  if (s.align) out.push(`text-align:${s.align}`);
  if (s.color) out.push(`color:${s.color}`);
  if (s.background) out.push(`background-color:${s.background}`);
  if (s.lineHeight) out.push(`line-height:${s.lineHeight}`);
  if (s.letterSpacing) out.push(`letter-spacing:${s.letterSpacing}px`);
  if (s.direction) out.push(`direction:${s.direction}`);
  if (s.padding !== undefined) out.push(`padding:${spacingToCss(s.padding)}`);
  if (s.border) out.push(borderToCss(s.border));
  if (s.borderRadius) out.push(`border-radius:${ptToPx(s.borderRadius)}px`);
  if (s.overflow === "ellipsis") out.push("overflow:hidden;white-space:nowrap;text-overflow:ellipsis");
  else if (s.overflow === "hidden" || s.overflow === "clip") out.push("overflow:hidden");
  return out.join(";");
}

function spacingToCss(spacing: unknown): string {
  if (typeof spacing === "number") return `${ptToPx(spacing)}px`;
  const s = spacing as { top?: number; right?: number; bottom?: number; left?: number };
  return `${ptToPx(s.top ?? 0)}px ${ptToPx(s.right ?? 0)}px ${ptToPx(s.bottom ?? 0)}px ${ptToPx(s.left ?? 0)}px`;
}

function borderToCss(border: unknown): string {
  const b = border as any;
  if (b.width !== undefined) {
    return `border:${ptToPx(b.width)}px ${b.style ?? "solid"} ${b.color ?? "#000"}`;
  }
  const sides = ["top", "right", "bottom", "left"] as const;
  return sides
    .filter((side) => b[side])
    .map((side) => `border-${side}:${ptToPx(b[side].width ?? 1)}px ${b[side].style ?? "solid"} ${b[side].color ?? "#000"}`)
    .join(";");
}
