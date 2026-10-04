import type { ResolvedWarning } from "@reporting/core";
import type { BlockRecord } from "./storage/types.js";

export type BlockLookup = (id: string) => Promise<BlockRecord | undefined>;

/**
 * Linked library blocks render the library's latest version. Their saved `children` is only a snapshot, used (with a
 * warning) when the library cannot supply the block. Pinned blocks always render their own snapshot.
 */
export async function refreshLinkedBlocks(report: unknown, lookup: BlockLookup | undefined): Promise<{ report: unknown; warnings: ResolvedWarning[] }> {
  const warnings: ResolvedWarning[] = [];
  const fragments = (report as { fragments?: unknown })?.fragments;
  if (!Array.isArray(fragments) || !fragments.some((f) => f?.source?.mode === "linked")) return { report, warnings };
  const refreshed = await Promise.all(fragments.map(async (fragment: any, index: number) => {
    if (fragment?.source?.mode !== "linked") return fragment;
    const block = lookup ? await lookup(fragment.source.block).catch(() => undefined) : undefined;
    if (!block || !Array.isArray(block.children)) {
      warnings.push({ code: "BLOCK_UNAVAILABLE", path: `fragments[${index}]`, message: `Library block "${fragment.source.block}" is unavailable; its saved version ${fragment.source.version} was used.` });
      return fragment;
    }
    return { ...fragment, children: block.children, source: { ...fragment.source, version: block.version } };
  }));
  return { report: { ...(report as object), fragments: refreshed }, warnings };
}
