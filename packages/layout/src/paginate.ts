import type { ResolvedComponent, ResolvedReport, ResolvedTableComponent, ResolvedSection } from "@reporting/core";
import type { TextMeasurer } from "./measure.js";
import { defaultTextMeasurer, ellipsizeText, wrapTextLines } from "./measure.js";
import { resolvePageGeometry } from "./units.js";
import { edgesOf, layoutComponent, marginOf, measureFooterHeight, measureHeaderRowHeights, measureTableRowHeights, resolveColumnWidths, shiftNode } from "./box-layout.js";
import type { PageLayout, PaginatedReport, PaginationDecision, PositionedNode } from "./types.js";

export interface PaginateOptions {
  measurer?: TextMeasurer;
  /** Re-resolves a pageHeader/pageFooter section's components for a specific
   * page, with `page.number`/`page.total` bound to real values. If omitted, the
   * section's already-resolved (page-number-less) content is repeated verbatim. */
  resolvePageDependentSection?: (section: ResolvedSection, page: { number: number; total: number }) => ResolvedComponent[];
}

/** Warnings that mean a generated document may omit or misplace report data. */
export const isDataLossWarningCode = (code: string): boolean =>
  code === "CONTENT_OVERFLOWS_PAGE" || code === "TEXT_EXCEEDS_HEIGHT" || code === "CONTAINER_CONTENT_EXCEEDS_HEIGHT";

/**
 * Page masters: a report may declare several pageHeader / pageFooter sections,
 * each with `appliesTo` first | last | odd | even | standard | all. For page
 * N of T the most specific match wins: first (N=1) > last (N=T) > odd/even >
 * standard > all/unspecified. A page with no matching section simply has no
 * header/footer, so "hide the header on the first page" is a `first` master
 * that is empty.
 */
export function pickMaster(sections: ResolvedSection[], pageNumber: number, total: number): ResolvedSection | undefined {
  const at = (v: string) => sections.find((s) => s.appliesTo === v);
  if (pageNumber === 1 && at("first")) return at("first");
  if (pageNumber === total && at("last")) return at("last");
  const parity = pageNumber % 2 === 1 ? "odd" : "even";
  if (at(parity)) return at(parity);
  return at("standard") ?? sections.find((s) => !s.appliesTo || s.appliesTo === "all");
}

export function paginate(report: ResolvedReport, options: PaginateOptions = {}): PaginatedReport {
  const measurer = options.measurer ?? defaultTextMeasurer;
  const geometry = resolvePageGeometry(report.page);
  const warnings: PaginatedReport["warnings"] = [...report.warnings];

  const headers = report.sections.filter((s) => s.type === "pageHeader");
  const footers = report.sections.filter((s) => s.type === "pageFooter");
  const backgrounds = report.sections.filter((s) => s.type === "background");
  const contentComponents = report.sections.filter((s) => s.type !== "pageHeader" && s.type !== "pageFooter" && s.type !== "background").flatMap((s) => s.children);

  const heightCache = new Map<ResolvedSection, number>();
  const heightOf = (s: ResolvedSection | undefined): number => {
    if (!s) return 0;
    let h = heightCache.get(s);
    if (h === undefined) {
      h = layoutBlock(s.children, geometry.contentWidth, measurer).height;
      heightCache.set(s, h);
    }
    return h;
  };
  const bodyHeightFor = (pageNumber: number, total: number) =>
    Math.max(1, geometry.contentHeight - heightOf(pickMaster(headers, pageNumber, total)) - heightOf(pickMaster(footers, pageNumber, total)));

  // The master of the last page depends on the total page count, which depends
  // on the masters' heights: iterate until the count is stable.
  let guess = Number.POSITIVE_INFINITY;
  let run = layoutContentIntoPages(contentComponents, geometry.contentWidth, (i) => bodyHeightFor(i + 1, guess), measurer);
  for (let i = 0; i < 4 && run.pages.length !== guess; i++) {
    guess = run.pages.length;
    run = layoutContentIntoPages(contentComponents, geometry.contentWidth, (idx) => bodyHeightFor(idx + 1, guess), measurer);
  }
  const total = run.pages.length;

  if (geometry.contentHeight - Math.max(0, ...headers.map(heightOf)) - Math.max(0, ...footers.map(heightOf)) <= 0) {
    warnings.push({ code: "PAGE_HEADER_FOOTER_TOO_LARGE", path: "page", message: "Page header/footer leave no room for content." });
  }

  const pages: PageLayout[] = run.pages.map((content, i) => {
    const number = i + 1;
    const headerSection = pickMaster(headers, number, total);
    const footerSection = pickMaster(footers, number, total);
    const hh = heightOf(headerSection);
    const fh = heightOf(footerSection);

    const resolveFor = (s: ResolvedSection | undefined) =>
      !s ? [] : options.resolvePageDependentSection ? options.resolvePageDependentSection(s, { number, total }) : s.children;

    const header = layoutBlock(resolveFor(headerSection), geometry.contentWidth, measurer, { x: geometry.margin.left, y: geometry.margin.top }).nodes;
    const footer = layoutBlock(resolveFor(footerSection), geometry.contentWidth, measurer, {
      x: geometry.margin.left,
      y: geometry.height - geometry.margin.bottom - fh,
    }).nodes;

    const bgSection = pickMaster(backgrounds, number, total);
    const background = bgSection
      ? layoutBlock(
          [{ type: "container", layout: "absolute", width: geometry.width, height: geometry.height, children: options.resolvePageDependentSection ? options.resolvePageDependentSection(bgSection, { number, total }) : bgSection.children } as any],
          geometry.width,
          measurer,
          { x: 0, y: 0 }
        ).nodes
      : [];

    return {
      number,
      header,
      footer,
      background,
      content: offsetNodes(content, geometry.margin.left, geometry.margin.top + hh),
      zones: {
        header: { y: geometry.margin.top, height: hh },
        body: { y: geometry.margin.top + hh, height: geometry.contentHeight - hh - fh },
        footer: { y: geometry.height - geometry.margin.bottom - fh, height: fh },
      },
      master: { header: headerSection?.sourceIndex, footer: footerSection?.sourceIndex },
    };
  });

  warnings.push(...run.warnings);
  const seenOverflows = new Set<string>();
  const deepestBottom = (node: PositionedNode): number => Math.max(node.box.y + node.box.height, ...(node.children ?? []).map(deepestBottom));
  const inspect = (nodes: PositionedNode[]) => {
    for (const node of nodes) {
      const c = node.component as any;
      if (["text", "richText", "field"].includes(c.type) && !node.textFragment) {
        const style = c.style ?? {};
        const pad = edgesOf(style.padding);
        const fontSize = style.fontSize ?? 10;
        const hint = { family: style.fontFamily, bold: style.fontWeight === "bold" || (typeof style.fontWeight === "number" && style.fontWeight >= 700), italic: Boolean(style.italic), lineHeight: style.lineHeight };
        const width = Math.max(1, node.box.width - pad.left - pad.right);
        const lineHeight = measurer.lineHeight(fontSize, hint);
        const actualHeight = wrapTextLines(c.text ?? "", width, fontSize, measurer, hint).length * lineHeight + pad.top + pad.bottom;
        let code: string | undefined;
        let message = "";
        if (style.overflow === "ellipsis") {
          const display = ellipsizeText(c.text ?? "", width, fontSize, measurer, hint);
          node.renderText = display.text;
          if (node.box.height + 0.5 < lineHeight + pad.top + pad.bottom) {
            code = "TEXT_EXCEEDS_HEIGHT";
            message = `Text ${label(node.component)} is too short to show even one ellipsis line.`;
          } else if (display.truncated) {
            code = "TEXT_TRUNCATED_BY_POLICY";
            message = `Text ${label(node.component)} was shortened with an ellipsis as requested by its overflow setting.`;
          }
        } else if ((c.height !== undefined || c.maxHeight !== undefined) && actualHeight > node.box.height + 0.5) {
          const intentional = style.overflow === "clip" || style.overflow === "hidden";
          code = intentional ? "TEXT_TRUNCATED_BY_POLICY" : "TEXT_EXCEEDS_HEIGHT";
          message = intentional
            ? `Text ${label(node.component)} is clipped to its fixed height as requested by its overflow setting.`
            : `Text ${label(node.component)} needs ${pt(actualHeight)} but its height is limited to ${pt(node.box.height)}; output may clip or flow unexpectedly.`;
        }
        const key = `${code}:${c.id ?? `${c.type}:${node.box.x}:${node.box.y}`}`;
        if (code && !seenOverflows.has(key)) {
          seenOverflows.add(key);
          warnings.push({ code, path: c.id ?? c.type, message });
        }
      }
      if (node.children?.length && (c.height !== undefined || c.maxHeight !== undefined)) {
        const excess = Math.max(0, ...node.children.map((child) => deepestBottom(child) - node.box.y - node.box.height));
        const key = c.id ?? `${c.type}:${node.box.x}:${node.box.y}`;
        if (excess > 0.5 && !seenOverflows.has(key)) {
          seenOverflows.add(key);
          warnings.push({ code: "CONTAINER_CONTENT_EXCEEDS_HEIGHT", path: c.id ?? c.type, message: `Container ${label(node.component)} has content extending ${pt(excess)} below its fixed height; it may overlap or be clipped.` });
        }
      }
      if (node.children) inspect(node.children);
    }
  };
  for (const page of pages) inspect([...page.header, ...page.content, ...page.footer]);
  return {
    pageSize: { width: geometry.width, height: geometry.height },
    margin: geometry.margin,
    pages: pages.length
      ? pages
      : [{ number: 1, header: [], footer: [], background: [], content: [], zones: { header: { y: 0, height: 0 }, body: { y: 0, height: geometry.height }, footer: { y: geometry.height, height: 0 } }, master: {} }],
    decisions: run.decisions,
    warnings,
  };
}

function layoutBlock(components: ResolvedComponent[], width: number, measurer: TextMeasurer, origin = { x: 0, y: 0 }) {
  let y = origin.y;
  const nodes: PositionedNode[] = [];
  for (const component of components) {
    const m = marginOf(component);
    const node = layoutComponent(component, { x: origin.x + m.left, y: y + m.top, width: Math.max(1, width - m.left - m.right), height: 0 }, measurer);
    nodes.push(node);
    y = node.box.y + node.box.height + m.bottom;
  }
  return { nodes, height: y - origin.y };
}

function offsetNodes(nodes: PositionedNode[], dx: number, dy: number): PositionedNode[] {
  return nodes.map((node) => {
    const copy: PositionedNode = { ...node, box: { ...node.box }, children: node.children ? offsetNodes(node.children, 0, 0) : undefined };
    shiftNode(copy, dx, dy);
    return copy;
  });
}

interface ContentRun {
  pages: PositionedNode[][];
  decisions: PaginationDecision[];
  warnings: PaginatedReport["warnings"];
}

const pt = (n: number) => `${Math.round(n * 10) / 10}pt`;
const label = (c: ResolvedComponent) => `"${(c as any).id ?? c.type}"`;

/** The core pagination loop: walks components in order, placing each on the
 * current page if it fits, honoring pageBreakBefore/After, keepTogether and
 * keepWithNext, margins, and splitting tables row-by-row across pages
 * (repeating the header on continuation pages). Every move to a new page is
 * recorded as a decision so the designer can explain it. */
function layoutContentIntoPages(
  input: ResolvedComponent[],
  width: number,
  pageHeightAt: (pageIndex: number) => number,
  measurer: TextMeasurer
): ContentRun {
  // work on a copy: containers that cannot fit a page are replaced by their children while we paginate
  const components: ResolvedComponent[] = [...input];
  const pages: PositionedNode[][] = [[]];
  const decisions: PaginationDecision[] = [];
  const warnings: PaginatedReport["warnings"] = [];
  let y = 0;

  const decide = (d: Omit<PaginationDecision, "page">) => decisions.push({ ...d, page: pages.length + 1 });
  // Group headers marked repeatEveryPage that are currently "open": they are printed again at the top of every continuation page.
  const repeatStack: { level: number; instance: number; comps: ResolvedComponent[] }[] = [];
  let repeatWarned = false;
  const repeatMeasure = (): { total: number; nodes: { comp: ResolvedComponent; height: number; top: number; bottom: number }[] } => {
    const nodes = repeatStack.flatMap((e) => e.comps).map((comp) => {
      const mm = marginOf(comp);
      const n = layoutComponent(comp, { x: 0, y: 0, width: Math.max(1, width - mm.left - mm.right), height: 0 }, measurer);
      return { comp, height: n.box.height, top: mm.top, bottom: mm.bottom };
    });
    return { total: nodes.reduce((a, n) => a + n.height + n.top + n.bottom, 0), nodes };
  };
  /** Height consumed at the top of every continuation page by repeated group headers. */
  const repeatHeight = () => {
    if (!repeatStack.length) return 0;
    const { total } = repeatMeasure();
    return total > pageHeightAt(pages.length) * 0.4 ? 0 : total;
  };
  const newPage = () => {
    pages.push([]);
    y = 0;
    if (!repeatStack.length) return;
    const { total, nodes } = repeatMeasure();
    if (total > pageHeightAt(pages.length - 1) * 0.4) {
      if (!repeatWarned) {
        repeatWarned = true;
        warnings.push({ code: "REPEATED_HEADERS_TOO_TALL", path: "groups", message: "Repeated group headers take more than 40% of a page, so they are not repeated on continuation pages." });
      }
      return;
    }
    for (const n of nodes) {
      const clone: any = { ...n.comp, pageBreakBefore: false, pageBreakAfter: false, keepWithNext: false, band: { ...(n.comp as any).band, repeated: true } };
      const placed = layoutComponent(clone, { x: marginOf(clone).left, y: y + n.top, width: Math.max(1, width - marginOf(clone).left - marginOf(clone).right), height: 0 }, measurer);
      pages[pages.length - 1]!.push(placed);
      y = placed.box.y + placed.box.height + n.bottom;
      decisions.push({
        kind: "group-header-repeated",
        page: pages.length,
        componentId: (n.comp as any).id,
        sectionIndex: (n.comp as any).band?.sectionIndex,
        sectionId: (n.comp as any).band?.sectionId,
        message: `Group header ${label(n.comp)} is repeated at the top of page ${pages.length} because its group continues here.`,
        actions: [{ label: "Stop repeating this header", target: "band", patch: { repeatEveryPage: false } }],
      });
    }
  };
  const currentPage = () => pages[pages.length - 1]!;
  const pageHeight = () => pageHeightAt(pages.length - 1);
  const remaining = () => pageHeight() - y;

  for (let idx = 0; idx < components.length; idx++) {
    const component = components[idx]!;
    const anyC = component as any;
    const m = marginOf(component);
    const innerWidth = Math.max(1, width - m.left - m.right);
    const place = (node: PositionedNode) => {
      shiftNode(node, 0, 0);
      currentPage().push(node);
    };

    // Containers (and bands, groups, repeaters) are laid out as one box. When one cannot fit a page, dissolve it into
    // its children so they paginate individually: nothing is ever drawn below the page edge.
    const parts = flowParts(component);
    if (parts) {
      const probe = layoutComponent(component, { x: 0, y: 0, width: innerWidth, height: 0 }, measurer);
      const needed = probe.box.height + m.top + m.bottom;
      const tooTall = needed > pageHeightAt(pages.length) - repeatHeight();
      const bandInfo = anyC.band as { allowSplit?: boolean } | undefined;
      const splitNow = tooTall || (bandInfo?.allowSplit === true && !anyC.keepTogether && needed > remaining());
      if (splitNow && parts.length > 0) {
        const first = parts[0] as any;
        const last = parts[parts.length - 1] as any;
        if (anyC.pageBreakBefore) first.pageBreakBefore = true;
        if (anyC.pageBreakAfter) last.pageBreakAfter = true;
        if (anyC.keepWithNext) last.keepWithNext = true;
        const meta = anyC.band as any;
        if (meta?.type === "groupHeader" || meta?.type === "groupFooter") for (const p of parts as any[]) p.band ??= { ...meta, repeatEveryPage: false };
        components.splice(idx, 1, ...parts);
        idx--;
        continue;
      }
    }

    const band = anyC.band as { type?: string; level?: number; instance?: number; repeatEveryPage?: boolean; sectionIndex?: number; sectionId?: string } | undefined;
    const source = band && typeof band.sectionIndex === "number" ? { sectionIndex: band.sectionIndex, sectionId: band.sectionId } : {};
    const actionTarget = band && typeof band.sectionIndex === "number" ? "band" as const : "component" as const;
    if (band?.type === "groupHeader") {
      // a new instance of this group (or an outer one) closes any repeated header of the same or deeper level
      for (let k = repeatStack.length - 1; k >= 0; k--) if (repeatStack[k]!.level >= (band.level ?? 0) && repeatStack[k]!.instance !== band.instance) repeatStack.splice(k, 1);
    }

    if (anyC.pageBreakBefore && y > 0) {
      decide({ kind: "forced-break", componentId: anyC.id, ...source, message: `${label(component)} starts on a new page (page break before).`, actions: [{ label: "Remove page break", target: actionTarget, patch: actionTarget === "band" ? { newPageBefore: false } : { pageBreakBefore: false } }] });
      newPage();
    }

    // keep-with-next *chains*: a run of consecutive keepWithNext components (a group header + its first records,
    // a whole keep-together group, a band and its child bands) must start on a page where the whole run fits.
    const prevKept = idx > 0 && Boolean((components[idx - 1] as any).keepWithNext);
    if (anyC.keepWithNext && !prevKept && idx + 1 < components.length && y > 0) {
      const freshRoom = pageHeightAt(pages.length) - repeatHeight();
      let combined = 0;
      let members = 0;
      let k = idx;
      for (; k < components.length; k++) {
        const c = components[k]!;
        const cm = marginOf(c);
        const n = layoutComponent(c, { x: 0, y: 0, width: Math.max(1, width - cm.left - cm.right), height: 0 }, measurer);
        combined += n.box.height + cm.top + cm.bottom;
        members++;
        if (combined > freshRoom || !(c as any).keepWithNext) break;
      }
      if (combined > remaining() && combined <= freshRoom) {
        const names = components.slice(idx, idx + members).map((c) => ((c as any).band?.name ?? (c as any).id ?? c.type) as string);
        decide({
          kind: members > 2 ? "keep-chain" : "keep-with-next",
          componentId: anyC.id,
          ...source,
          message:
            members > 2
              ? `${label(component)} is kept together with the ${members - 1} elements after it (${[...new Set(names)].slice(0, 3).join(", ")}): they need ${pt(combined)} but only ${pt(remaining())} is left.`
              : `${label(component)} is kept with the next element; together they need ${pt(combined)} but only ${pt(remaining())} is left.`,
          required: combined,
          available: remaining(),
          actions: [{ label: "Release keep-with-next", target: actionTarget, patch: { keepWithNext: false } }],
        });
        newPage();
      }
    }

    const textComponent = ["text", "richText", "field"].includes(component.type);
    const textStyle = (component.style ?? {}) as Record<string, any>;
    const textPad = edgesOf(textStyle.padding);
    const textFontSize = textStyle.fontSize ?? 10;
    const textHint = { family: textStyle.fontFamily, bold: textStyle.fontWeight === "bold" || (typeof textStyle.fontWeight === "number" && textStyle.fontWeight >= 700), italic: Boolean(textStyle.italic), lineHeight: textStyle.lineHeight };
    const textProbe = textComponent ? layoutComponent(component, { x: 0, y: y + m.top, width: innerWidth, height: 0 }, measurer) : undefined;
    const textLines = textComponent ? wrapTextLines(anyC.text ?? "", Math.max(1, textProbe!.box.width - textPad.left - textPad.right), textFontSize, measurer, textHint) : [];
    const lineHeight = textComponent ? measurer.lineHeight(textFontSize, textHint) : 0;
    const textHeight = textLines.length * lineHeight + textPad.top + textPad.bottom;
    const canSplitText = textComponent && textStyle.overflow !== "ellipsis" && lineHeight > 0 && anyC.height === undefined && anyC.minHeight === undefined && anyC.maxHeight === undefined && !anyC.keepTogether && anyC.allowSplit !== false;
    const splitText = canSplitText && textHeight + m.top + m.bottom > remaining() && (anyC.allowSplit === true || textHeight + m.top + m.bottom > pageHeightAt(pages.length) - repeatHeight());

    if (splitText) {
      let start = 0;
      const minBottom = Math.max(1, Number(anyC.minLinesAtBottom) || 1);
      const minTop = Math.max(1, Number(anyC.minLinesAtTop) || 1);
      while (start < textLines.length) {
        const capacity = Math.floor((remaining() - m.top - m.bottom - textPad.top - textPad.bottom + 0.01) / lineHeight);
        const fresh = currentPage().every((node) => Boolean((node.component as any).band?.repeated));
        if (capacity < 1) {
          if (fresh) throw new Error(`Text ${label(component)} cannot fit even one line in the available page area.`);
          decide({ kind: "text-split", componentId: anyC.id, message: `${label(component)} continues on the next page because no line fits in the ${pt(Math.max(0, remaining()))} left.`, required: lineHeight + textPad.top + textPad.bottom, available: remaining() });
          newPage();
          continue;
        }
        const left = textLines.length - start;
        let take = Math.min(left, capacity);
        if (take < left && take < minBottom && !fresh) {
          decide({ kind: "orphan-control", componentId: anyC.id, message: `${label(component)} moves to the next page so at least ${minBottom} lines stay below the break.`, required: minBottom * lineHeight + textPad.top + textPad.bottom, available: remaining() });
          newPage();
          continue;
        }
        if (take < left && left - take < minTop) {
          const adjusted = left - minTop;
          if (adjusted >= minBottom) {
            take = adjusted;
            decide({ kind: "widow-control", componentId: anyC.id, message: `${label(component)} keeps at least ${minTop} lines at the top of the next page.`, required: minTop * lineHeight + textPad.top + textPad.bottom, available: remaining() });
          } else if (!fresh) {
            decide({ kind: "widow-control", componentId: anyC.id, message: `${label(component)} moves to the next page to avoid leaving fewer than ${minTop} lines at the top.`, required: minTop * lineHeight + textPad.top + textPad.bottom, available: remaining() });
            newPage();
            continue;
          } else {
            warnings.push({ code: "TEXT_WIDOW_LIMIT_UNSATISFIED", path: anyC.id ?? component.type, message: `Text ${label(component)} cannot satisfy its minimum lines at the top and bottom of a page.` });
          }
        }
        const end = start + take;
        const fragment = textLines.slice(start, end).join("\n");
        const node = layoutComponent({ ...component, text: fragment } as ResolvedComponent, { x: m.left, y: y + m.top, width: innerWidth, height: 0 }, measurer);
        node.component = component;
        node.box.height = take * lineHeight + textPad.top + textPad.bottom;
        node.textFragment = { text: fragment, startLine: start, endLine: end, totalLines: textLines.length };
        place(node);
        y = node.box.y + node.box.height + m.bottom;
        start = end;
        if (start < textLines.length) {
          decide({ kind: "text-split", componentId: anyC.id, message: `${label(component)} continues on page ${pages.length + 1} at line ${start + 1} of ${textLines.length}.`, required: (textLines.length - start) * lineHeight, available: remaining() });
          newPage();
        }
      }
    } else if (component.type === "table" && !anyC.keepTogether) {
      placeTable(component as ResolvedTableComponent, innerWidth, measurer, {
        place: (node, height) => {
          node.box.y = y;
          node.box.x += m.left;
          currentPage().push(node);
          y += height;
        },
        remaining,
        freshRoom: () => pageHeightAt(pages.length) - repeatHeight(),
        isFresh: () => currentPage().every((node) => Boolean((node.component as any).band?.repeated)),
        newPage,
        decide,
      });
      y += m.bottom;
    } else {
      const probe = textProbe ?? layoutComponent(component, { x: 0, y: y + m.top, width: innerWidth, height: 0 }, measurer);
      const needed = probe.box.height + m.top + m.bottom;
      const fitsCurrent = needed <= remaining();
      const fitsFresh = needed <= pageHeightAt(pages.length) - repeatHeight();
      let moved = false;

      if (!fitsCurrent && y > 0) {
        if (fitsFresh) {
          const keep = Boolean(anyC.keepTogether);
          decide({
            kind: keep ? "keep-together" : "cannot-split",
            componentId: anyC.id,
            ...source,
            message: keep
              ? `${label(component)} is set to keep together: it needs ${pt(needed)} but only ${pt(remaining())} is left, so it moves to the next page.`
              : `${label(component)} cannot be split across pages: it needs ${pt(needed)} but only ${pt(remaining())} is left, so it moves to the next page.`,
            required: needed,
            available: remaining(),
            actions: keep ? [{ label: "Allow split", target: actionTarget, patch: { keepTogether: false } }] : undefined,
          });
          newPage();
          moved = true;
        } else {
          decide({ kind: "overflow", componentId: anyC.id, message: `${label(component)} (${pt(needed)}) is taller than a whole page and will overflow.`, required: needed, available: pageHeight() });
          warnings.push({
            code: "CONTENT_OVERFLOWS_PAGE",
            path: anyC.id ?? component.type,
            message: `Component ${label(component)} is taller than a full page and will overflow; manual splitting of this component type is not yet supported.`,
          });
          newPage();
          moved = true;
        }
      } else if (!fitsFresh) {
        warnings.push({
          code: "CONTENT_OVERFLOWS_PAGE",
          path: anyC.id ?? component.type,
          message: `Component ${label(component)} is taller than a full page and will overflow; manual splitting of this component type is not yet supported.`,
        });
      }

      const placed = moved ? layoutComponent(component, { x: m.left, y: y + m.top, width: innerWidth, height: 0 }, measurer) : probe;
      if (!moved) shiftNode(placed, m.left, 0);
      if (component.type === "table") (placed as PositionedNode).rowRange = { start: 0, end: (component as ResolvedTableComponent).rows.length };
      place(placed);
      y = placed.box.y + placed.box.height + m.bottom;
    }

    if (band?.type === "groupHeader" && band.repeatEveryPage) {
      let entry = repeatStack.find((e) => e.instance === band.instance && e.level === (band.level ?? 0));
      if (!entry) repeatStack.push((entry = { level: band.level ?? 0, instance: band.instance ?? -1, comps: [] }));
      entry.comps.push(component);
    }
    if (band?.type === "groupFooter") for (let k = repeatStack.length - 1; k >= 0; k--) if (repeatStack[k]!.level >= (band.level ?? 0)) repeatStack.splice(k, 1);

    if (anyC.pageBreakAfter) {
      newPage();
      decisions.push({ kind: "forced-break", page: pages.length, componentId: anyC.id, ...source, message: `A page break follows ${label(component)}.`, actions: [{ label: "Remove page break", target: actionTarget, patch: actionTarget === "band" ? { newPageAfter: false } : { pageBreakAfter: false } }] });
    }
  }

  // Drop a trailing empty page created by a forced break with nothing after it.
  if (pages.length > 1 && pages[pages.length - 1]!.length === 0) pages.pop();
  return { pages, decisions: decisions.filter((d) => d.page <= pages.length), warnings };
}

interface TablePlacer {
  place(node: PositionedNode, height: number): void;
  remaining(): number;
  freshRoom(): number;
  isFresh(): boolean;
  newPage(): void;
  decide(d: Omit<PaginationDecision, "page">): void;
}

function placeTable(
  table: ResolvedTableComponent,
  width: number,
  measurer: TextMeasurer,
  placer: TablePlacer
): void {
  const columnWidths = resolveColumnWidths(table, width);
  const rowHeights = measureTableRowHeights(table, columnWidths, measurer);
  const headerRowHeights = table.showHeader ? measureHeaderRowHeights(table, columnWidths, measurer) : [];
  const headerHeight = headerRowHeights.reduce((sum, height) => sum + height, 0);
  const footerHeight = table.showFooter ? measureFooterHeight(table, measurer) : 0;
  const tid = (table as any).id as string | undefined;

  const minBefore = (table as any).minRowsBeforeBreak ?? 0;
  const minAfter = (table as any).minRowsAfterBreak ?? 0;
  const safeBreakBefore = (proposed: number): number => {
    let point = proposed;
    let changed = true;
    while (changed) {
      changed = false;
      for (const span of table.cellSpans ?? []) {
        if (span.row < point && span.row + (span.rowSpan ?? 1) > point) {
          point = span.row;
          changed = true;
        }
      }
    }
    return point;
  };

  let rowIndex = 0;
  let sliceStart = 0;
  let isFirstSlice = true;
  let orphanPushAttempted = false;

  const flushSlice = (end: number, includeFooter: boolean) => {
    const showHeaderOnThisSlice = isFirstSlice ? table.showHeader : table.showHeader && table.repeatHeaderOnPageBreak;
    let height = showHeaderOnThisSlice ? headerHeight : 0;
    for (let i = sliceStart; i < end; i++) height += rowHeights[i]!;
    if (includeFooter) height += footerHeight;

    const node: PositionedNode = {
      component: { ...table, showHeader: showHeaderOnThisSlice, showFooter: includeFooter },
      box: { x: 0, y: 0, width, height },
      rowRange: { start: sliceStart, end },
      tableMetrics: { headerRowHeights, rowHeights },
    };
    placer.place(node, height);
    sliceStart = end;
    isFirstSlice = false;
    orphanPushAttempted = false;
  };

  const remainingRowsFitOnFreshPage = (fromIndex: number): boolean => {
    let height = table.showHeader && table.repeatHeaderOnPageBreak ? headerHeight : 0;
    for (let i = fromIndex; i < table.rows.length; i++) height += rowHeights[i]!;
    return height <= placer.freshRoom();
  };

  const startHeight = () => (table.showHeader && table.repeatHeaderOnPageBreak ? headerHeight : 0);

  let sliceHeight = table.showHeader ? headerHeight : 0;
  while (rowIndex < table.rows.length) {
    const rowHeight = rowHeights[rowIndex]!;
    const wouldOverflow = sliceHeight + rowHeight > placer.remaining();

    if (wouldOverflow && rowIndex > sliceStart) {
      const roomRows = rowIndex - sliceStart;
      if (roomRows < minBefore && sliceStart > 0 && !orphanPushAttempted) {
        orphanPushAttempted = true;
        placer.decide({ kind: "orphan-control", componentId: tid, rowIndex: sliceStart, message: `Only ${roomRows} row(s) fit here but "Min rows before break" is ${minBefore}; rows ${sliceStart + 1}-${rowIndex} move to the next page.` });
        placer.newPage();
        sliceHeight = startHeight();
        rowIndex = sliceStart;
        continue;
      }

      let breakPoint = rowIndex;
      const remainder = table.rows.length - breakPoint;
      if (remainder > 0 && remainder < minAfter && remainingRowsFitOnFreshPage(breakPoint)) {
        const maxPullback = breakPoint - sliceStart - minBefore;
        const pullback = Math.min(minAfter - remainder, Math.max(0, maxPullback));
        if (pullback > 0) {
          breakPoint -= pullback;
          placer.decide({ kind: "widow-control", componentId: tid, rowIndex: breakPoint, message: `"Min rows after break" is ${minAfter}: ${pullback} extra row(s) move to the last page so it does not start with a lone row.` });
        }
      }

      breakPoint = safeBreakBefore(breakPoint);
      if (breakPoint === sliceStart) {
        if (!placer.isFresh()) {
          placer.decide({ kind: "keep-together", componentId: tid, rowIndex: sliceStart, message: `Merged table rows starting at row ${sliceStart + 1} move together to the next page.` });
          placer.newPage();
          rowIndex = sliceStart;
          sliceHeight = startHeight();
          continue;
        }
        throw new Error(`Merged table rows starting at row ${sliceStart + 1} are taller than a whole page.`);
      }

      flushSlice(breakPoint, false);
      placer.decide({
        kind: "table-split",
        componentId: tid,
        rowIndex: breakPoint,
        required: rowHeight,
        available: placer.remaining(),
        message: `Table ${tid ? `"${tid}" ` : ""}continues on the next page: row ${breakPoint + 1} needs ${pt(rowHeight)} but only ${pt(Math.max(0, placer.remaining()))} is left. Rows are never cut in half.`,
      });
      placer.newPage();
      sliceHeight = startHeight();
      rowIndex = breakPoint;
      continue;
    }
    if (wouldOverflow && rowIndex === sliceStart) {
      // Nothing of this table fits on the current page (the header plus one row is too tall): start on a new page.
      if (!placer.isFresh()) {
        placer.decide({ kind: "cannot-split", componentId: tid, rowIndex, required: sliceHeight + rowHeight, available: placer.remaining(), message: `Table ${tid ? `"${tid}" ` : ""}starts on the next page: its header and first row need ${pt(sliceHeight + rowHeight)} but only ${pt(placer.remaining())} is left.` });
        placer.newPage();
        sliceHeight = isFirstSlice ? (table.showHeader ? headerHeight : 0) : startHeight();
      } else {
        throw new Error(`Table row ${rowIndex + 1} is taller than a whole page.`);
      }
    }

    sliceHeight += rowHeight;
    rowIndex++;
  }

  const footerFits = sliceHeight + footerHeight <= placer.remaining();
  if (!footerFits && table.showFooter) {
    flushSlice(rowIndex, false);
    placer.decide({ kind: "keep-together", componentId: tid, required: footerHeight, available: placer.remaining(), message: `The totals row of ${tid ? `"${tid}" ` : "the table "}needs ${pt(footerHeight)} but only ${pt(Math.max(0, placer.remaining()))} is left; it moves to the next page.` });
    placer.newPage();
    flushSlice(rowIndex, true);
  } else {
    flushSlice(rowIndex, table.showFooter);
  }
}


/** The children a container can be dissolved into without changing what is printed (flow layout, no fixed size, no decoration). */
function flowParts(component: ResolvedComponent): ResolvedComponent[] | undefined {
  const c = component as any;
  if (c.type === "group") {
    return (c.groups ?? []).flatMap((g: any) => [...(g.header ?? []), ...(g.children ?? []), ...(g.footer ?? [])]);
  }
  if (!["container", "column", "repeater", "keepTogether"].includes(c.type)) return undefined;
  if (c.layout && c.layout !== "flow") return undefined;
  if (c.height !== undefined || c.minHeight !== undefined) return undefined;
  const st = c.style ?? {};
  if (st.background || st.border || st.padding) return undefined;
  return Array.isArray(c.children) ? c.children : undefined;
}
