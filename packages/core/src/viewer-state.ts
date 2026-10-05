/**
 * Interactive choices a viewer makes on a rendered report, applied to the definition before it resolves,
 * so pagination, totals and every output format stay correct (no client-side reshuffling of laid-out pages).
 */
export interface ViewerState {
  /** Sort a table or crosstab by one of its columns (the column id the HTML output reports). */
  sort?: { component: string; column: string; direction: "asc" | "desc" }[];
  /** Drill-down groups whose state the viewer flipped from the report's initial `drillDown`, by group key. */
  toggle?: { component: string; keys: string[] }[];
}

type Node = Record<string, unknown> & { id?: string; type?: string };

const CHILD_LISTS = ["children", "header", "footer", "otherwise"] as const;
/** Crosstab columns are generated: r<n> row headings, c<n>m<n> cells, t<n> totals. */
const CROSSTAB_COLUMN = /^(r\d+|c\d+m\d+|t\d+)$/;

function columnId(column: Record<string, unknown>): unknown {
  return column.id ?? column.binding ?? column.header;
}

function sortFor(node: Node, column: string, direction: "asc" | "desc"): { binding: string; direction: "asc" | "desc" }[] | undefined {
  if (node.type === "crosstab") return CROSSTAB_COLUMN.test(column) ? [{ binding: `row.${column}`, direction }] : undefined;
  if (node.type !== "table") return undefined;
  const match = ((node.columns as Record<string, unknown>[] | undefined) ?? []).find((candidate) => columnId(candidate) === column);
  const binding = (match?.binding ?? match?.expression) as string | undefined;
  return binding ? [{ binding, direction }] : undefined;
}

/** Returns a new report with the viewer's choices applied; the input is never modified. */
export function applyViewerState<T>(report: T, state: ViewerState | undefined): T {
  const sorts = new Map((state?.sort ?? []).map((entry) => [entry.component, entry]));
  const toggles = new Map((state?.toggle ?? []).map((entry) => [entry.component, entry.keys.map(String)]));
  if (!sorts.size && !toggles.size) return report;
  const visit = (node: Node): Node => {
    let next = node;
    for (const key of CHILD_LISTS) {
      const list = node[key];
      if (!Array.isArray(list)) continue;
      const mapped = list.map((child) => visit(child as Node));
      if (mapped.some((child, index) => child !== list[index])) next = { ...next, [key]: mapped };
    }
    const sort = node.id ? sorts.get(node.id) : undefined;
    const sortBy = sort ? sortFor(node, sort.column, sort.direction === "desc" ? "desc" : "asc") : undefined;
    if (sortBy) next = { ...next, sortBy };
    const toggled = node.id && node.type === "group" ? toggles.get(node.id) : undefined;
    return toggled ? { ...next, drillToggled: toggled } : next;
  };
  const doc = report as unknown as { sections?: Node[] };
  const sections = (doc.sections ?? []).map(visit);
  return sections.some((section, index) => section !== doc.sections![index]) ? ({ ...doc, sections } as unknown as T) : report;
}
