import type { ResolvedReport } from "../src/index.js";

/** The components printed by report section `index`, with the band wrapper removed (page bands keep their own section). */
export function sectionChildren(resolved: ResolvedReport, index: number): any[] {
  const page = resolved.sections.find((s) => s.sourceIndex === index);
  if (page) return page.children as any[];
  const body = resolved.sections.find((s) => s.type === "body");
  return (body?.children ?? []).filter((c: any) => c.band?.sectionIndex === index).flatMap((c: any) => c.children);
}
