import type { LinkDefinition } from "@reporting/schema";

/** A link ready to draw: a safe href, plus the target report for drill-through links. */
export interface ResolvedLink {
  href: string;
  report?: { id: string; parameters: Record<string, unknown> };
}

/** Schemes a report may link to. Anything else (javascript:, data:, file:) is dropped with a warning. */
const SAFE_URL = /^(https?:\/\/|mailto:|tel:)/i;

/**
 * Turns a link definition into an href. `report` links drill through to another report: viewers that
 * understand the `report:` scheme open it in place; in a PDF they are left out.
 */
export function resolveLink(link: LinkDefinition, evaluate: (expression: string) => unknown, warn: (message: string) => void): ResolvedLink | undefined {
  if (link.report !== undefined) {
    if (!link.report.trim()) return undefined;
    const parameters: Record<string, unknown> = {};
    for (const [name, expression] of Object.entries(link.parameters ?? {})) parameters[name] = evaluate(expression);
    const pairs = Object.entries(parameters).map(([name, value]): [string, string] => [name, value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value)]);
    const query = new URLSearchParams(pairs).toString();
    return { href: `report:${encodeURIComponent(link.report)}${query ? `?${query}` : ""}`, report: { id: link.report, parameters } };
  }
  const raw = link.expression?.trim() ? evaluate(link.expression) : link.url;
  if (raw === null || raw === undefined || raw === "") return undefined;
  const href = String(raw).trim();
  if (!SAFE_URL.test(href)) {
    warn(`Link "${href.slice(0, 60)}" was left out: only http, https, mailto and tel links are allowed.`);
    return undefined;
  }
  // Spaces and other unsafe characters in computed links are encoded; existing escapes are kept.
  try {
    return { href: encodeURI(decodeURI(href)) };
  } catch {
    return { href: encodeURI(href) };
  }
}
