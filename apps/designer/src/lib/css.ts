/** Resolved style -> CSS at a given pixels-per-point scale. Mirrors the HTML renderer so the canvas matches Preview. */
import type { Capabilities } from "../engine";
import { canvasFontStack } from "./fonts";

export function cssFrom(style: Record<string, any> | undefined, k: number, caps?: Capabilities): React.CSSProperties {
  if (!style) return {};
  const px = (n: number) => `${(n * k).toFixed(2)}px`;
  const css: Record<string, any> = {};
  if (style.fontFamily) css.fontFamily = canvasFontStack(caps, style.fontFamily);
  if (style.fontSize) css.fontSize = px(style.fontSize);
  if (style.fontWeight) css.fontWeight = style.fontWeight === "bold" ? 700 : style.fontWeight === "normal" ? 400 : style.fontWeight;
  if (style.italic) css.fontStyle = "italic";
  const deco = [style.underline && "underline", style.strikethrough && "line-through"].filter(Boolean).join(" ");
  if (deco) css.textDecoration = deco;
  if (style.align) css.textAlign = style.align;
  if (style.color) css.color = style.color;
  if (style.background) css.backgroundColor = style.background;
  if (style.lineHeight) css.lineHeight = style.lineHeight;
  if (style.letterSpacing) css.letterSpacing = px(style.letterSpacing);
  if (style.direction) css.direction = style.direction;
  if (style.padding !== undefined) {
    css.padding = typeof style.padding === "number" ? px(style.padding) : `${px(style.padding.top ?? 0)} ${px(style.padding.right ?? 0)} ${px(style.padding.bottom ?? 0)} ${px(style.padding.left ?? 0)}`;
  }
  if (style.border) {
    const b = style.border;
    if (b.width !== undefined || b.style || b.color) css.border = `${px(b.width ?? 1)} ${b.style ?? "solid"} ${b.color ?? "#000"}`;
    else for (const side of ["top", "right", "bottom", "left"]) if (b[side]) css[`border${side[0]!.toUpperCase()}${side.slice(1)}`] = `${px(b[side].width ?? 1)} ${b[side].style ?? "solid"} ${b[side].color ?? "#000"}`;
  }
  if (style.overflow === "ellipsis") Object.assign(css, { overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" });
  return css;
}
