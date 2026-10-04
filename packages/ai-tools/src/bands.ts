/**
 * Band awareness for AI tools. A report's `sections` are its bands, printed by type: report header, page header and
 * footer variants, group headers and footers, detail, and so on. Most bands have no id, so tools address them by
 * reference: `@detail`, `@groupHeader:byRegion` (group id), `@pageFooter:first` (page variant), `@child:<parent>`;
 * `#n` picks the n-th of several bands with the same reference (`@detail#2`). A band with an id is `#id`.
 */

type Section = Record<string, any>;

const GROUP_BANDS = new Set(["groupHeader", "groupFooter"]);
const PAGE_BANDS = new Set(["pageHeader", "pageFooter", "background"]);

function qualifier(section: Section): string | undefined {
  if (GROUP_BANDS.has(section.type)) return section.groupId ?? undefined;
  if (PAGE_BANDS.has(section.type)) return section.appliesTo && section.appliesTo !== "all" ? section.appliesTo : undefined;
  if (section.type === "child") return section.parent ?? undefined;
  return undefined;
}

const baseRef = (section: Section) => `@${section.type}${qualifier(section) ? `:${qualifier(section)}` : ""}`;

/** The reference of every band, in order: `#id` when it has one, else `@type[:qualifier][#n]`. */
export function bandRefs(sections: Section[]): string[] {
  const bases = sections.map(baseRef);
  return sections.map((section, index) => {
    if (typeof section.id === "string" && section.id) return `#${section.id}`;
    const same = bases.filter((base) => base === bases[index]).length;
    if (same === 1) return bases[index]!;
    return `${bases[index]}#${bases.slice(0, index + 1).filter((base) => base === bases[index]).length}`;
  });
}

/** Index of the band an `@…` reference names; throws a message that lists the valid references. */
export function resolveBandRef(sections: Section[], ref: string): number {
  const match = /^@([A-Za-z]+)(?::([^#]+))?(?:#(\d+))?$/.exec(ref);
  if (!match) throw new Error(`"${ref}" is not a band reference. Use @type, @type:qualifier or @type#n, e.g. @detail or @groupHeader:byRegion.`);
  const [, type, wanted, nth] = match;
  const ofType = sections.map((section, index) => ({ section, index })).filter(({ section }) => section.type === type);
  const refs = bandRefs(sections);
  const known = (list: { index: number }[]) => list.map(({ index }) => refs[index]).join(", ");
  if (!ofType.length) {
    const types = [...new Set(sections.map((s) => s.type))].join(", ");
    throw new Error(`No ${type} band in this report. Bands present: ${types || "none"}.`);
  }
  let candidates = wanted !== undefined
    ? ofType.filter(({ section }) => qualifier(section) === wanted)
    : ofType.filter(({ section }) => qualifier(section) === undefined);
  if (wanted === undefined && !candidates.length) candidates = ofType;
  if (!candidates.length) throw new Error(`No ${type} band matches "${ref}". Use one of: ${known(ofType)}.`);
  if (nth !== undefined) {
    const picked = candidates[Number(nth) - 1];
    if (!picked) throw new Error(`"${ref}": there are only ${candidates.length} matching ${type} band(s).`);
    return picked.index;
  }
  if (candidates.length > 1) throw new Error(`"${ref}" is ambiguous: there are ${candidates.length} ${type} bands. Use one of: ${known(candidates)}.`);
  return candidates[0]!.index;
}

const FLAGS = ["newPageBefore", "newPageAfter", "keepTogether", "keepWithNext", "keepWithPrevious", "printAtBottom", "repeatEveryPage", "suppressWhenBlank", "hidden", "locked"];

function bandSummary(section: Section): string {
  const parts: string[] = [];
  if (section.name) parts.push(`"${section.name}"`);
  if (section.dataset) parts.push(`dataset ${section.dataset}`);
  if (section.groupId) parts.push(`group ${section.groupId}`);
  if (section.groupBy) parts.push(`grouped by ${section.groupBy}`);
  if (section.parent) parts.push(`child of ${section.parent}`);
  if (section.layout) parts.push(`layout ${section.layout}`);
  if (section.height !== undefined) parts.push(`height ${section.height}pt`);
  if (section.allowSplit !== undefined) parts.push(`allowSplit ${section.allowSplit}`);
  for (const flag of FLAGS) if (section[flag]) parts.push(flag);
  if (section.visibleWhen) parts.push(`visibleWhen ${section.visibleWhen}`);
  if (section.rules?.length) parts.push(`${section.rules.length} rule(s)`);
  return parts.join(" · ");
}

function componentLabel(component: Section): string {
  const raw = component.name ?? component.binding ?? component.expression ?? component.value ?? component.dataset ?? component.ref ?? "";
  const text = String(raw).replace(/\s+/g, " ");
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

function componentLines(children: Section[] | undefined, depth: number, out: string[]): void {
  for (const component of children ?? []) {
    const label = componentLabel(component);
    out.push(`${"  ".repeat(depth)}${component.id ? `#${component.id}` : "(no id)"} [${component.type}]${label ? ` ${label}` : ""}`);
    componentLines(component.children, depth + 1, out);
    if (component.otherwise) componentLines(component.otherwise, depth + 1, out);
  }
}

/** A plain-text outline of the report for a model: datasets, groups, then every band in order with its print rules and components. */
export function describeStructure(report: Section, maxLines = 400): string {
  const sections: Section[] = report.sections ?? [];
  const refs = bandRefs(sections);
  const lines: string[] = [`Report "${report.name ?? report.id ?? ""}"`];
  lines.push(`Datasets: ${(report.datasets ?? []).map((d: Section) => `${d.id} (${d.source})`).join(", ") || "none"}`);
  const groups = (report.groups ?? []).map((g: Section) => {
    const details = [g.dataset ? `dataset ${g.dataset}` : "", g.repeatHeader ? "repeats header" : "", g.newPage && g.newPage !== "none" ? `new page ${g.newPage}` : ""].filter(Boolean);
    return `${g.id} by ${g.by}${details.length ? ` (${details.join(", ")})` : ""}`;
  });
  lines.push(`Groups: ${groups.join("; ") || "none"}`);
  lines.push(`Parameters: ${(report.parameters ?? []).map((p: Section) => p.id).join(", ") || "none"}; variables: ${(report.variables ?? []).map((v: Section) => `${v.id} (${v.scope})`).join(", ") || "none"}`);
  lines.push("Bands in order (address with the reference at the start of each line):");
  sections.forEach((section, index) => {
    const summary = bandSummary(section);
    lines.push(`${refs[index]} [${section.type}]${summary ? ` ${summary}` : ""}`);
    if (!section.children?.length) lines.push("  (empty)");
    else componentLines(section.children, 1, lines);
  });
  for (const fragment of report.fragments ?? []) {
    lines.push(`Reusable block ${fragment.id}${fragment.source ? ` (library ${fragment.source.block}, ${fragment.source.mode ?? "linked"})` : ""}`);
    componentLines(fragment.children, 1, lines);
  }
  if (lines.length > maxLines) return [...lines.slice(0, maxLines), `… ${lines.length - maxLines} more line(s)`].join("\n");
  return lines.join("\n");
}

/** Band-level differences between two reports, by band reference. */
export function summarizeBandChanges(before: Section, after: Section): string[] {
  const index = (report: Section) => {
    const sections: Section[] = report.sections ?? [];
    const refs = bandRefs(sections);
    return new Map(sections.map((section, i) => [refs[i]!, section]));
  };
  const a = index(before);
  const b = index(after);
  const out: string[] = [];
  for (const [ref, section] of b) {
    const old = a.get(ref);
    if (!old) { out.push(`added band ${ref}`); continue; }
    const keys = new Set([...Object.keys(old), ...Object.keys(section)]);
    const changed = [...keys].filter((key) => key !== "children" && JSON.stringify(old[key]) !== JSON.stringify(section[key]));
    if (changed.length) out.push(`changed band ${ref}: ${changed.join(", ")}`);
  }
  for (const ref of a.keys()) if (!b.has(ref)) out.push(`removed band ${ref}`);
  return out;
}
