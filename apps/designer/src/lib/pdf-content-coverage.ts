import type { PaginatedReport, PositionedNode } from "@reporting/layout";

export interface PageTextCheck {
  page: number;
  componentId?: string;
  text: string;
}

const compact = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").trim();

/** Checks short, ordinary Latin text placed by PDF-measured pagination. */
export function planPageTextChecks(paginated: PaginatedReport): PageTextCheck[] {
  const checks: PageTextCheck[] = [];
  const seen = new Set<string>();
  const visit = (node: PositionedNode, page: number) => {
    const component = node.component;
    if (component.type === "text" || component.type === "field" || component.type === "richText") {
      const text = node.renderText ?? node.textFragment?.text ?? component.text;
      const normalized = compact(text);
      if (normalized.length >= 6 && normalized.length <= 160 && /^[\x20-\x7E]+$/.test(normalized) && component.style?.overflow !== "clip") {
        const key = `${page}\u0000${component.id ?? ""}\u0000${normalized}`;
        if (!seen.has(key)) {
          seen.add(key);
          checks.push({ page, componentId: component.id, text });
        }
      }
    }
    for (const child of node.children ?? []) visit(child, page);
  };
  for (const page of paginated.pages) {
    for (const zone of [page.background, page.header, page.content, page.footer]) {
      for (const node of zone) visit(node, page.number);
    }
  }
  return checks;
}

export function comparePageTextChecks(pageTexts: string[], checks: PageTextCheck[]) {
  const normalizedPages = pageTexts.map(compact);
  const missing = checks.filter((check) => !normalizedPages[check.page - 1]?.includes(compact(check.text)));
  return { found: checks.length - missing.length, total: checks.length, missing };
}
