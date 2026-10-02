import { escapeHtml } from "./escape.js";
import type { RenderInput, RenderResult, RendererCapabilities, ReportRenderer } from "@reporting/core";
import { paginate } from "@reporting/layout";
import { renderNode } from "./render-node.js";
import { ptToPx } from "./style.js";

export const htmlRendererCapabilities: RendererCapabilities = {
  id: "html",
  mimeType: "text/html",
  extension: "html",
  supports: ["*"],
};

export class HtmlRenderer implements ReportRenderer {
  readonly capabilities = htmlRendererCapabilities;

  async render(input: RenderInput): Promise<RenderResult> {
    const paginated = paginate(input.resolved, {
      resolvePageDependentSection: input.resolvePageSection,
    });

    const pageWidthPx = ptToPx(paginated.pageSize.width);
    const pageHeightPx = ptToPx(paginated.pageSize.height);

    const pagesHtml = await Promise.all(
      paginated.pages.map(async (page) => {
        const background = (await Promise.all(page.background.map(renderNode))).join("");
        const header = (await Promise.all(page.header.map(renderNode))).join("");
        const footer = (await Promise.all(page.footer.map(renderNode))).join("");
        const content = (await Promise.all(page.content.map(renderNode))).join("");
        const wm = input.resolved.watermark;
        const mark =
          wm && (wm.pages !== "first" || page.number === 1)
            ? `<div class="watermark" aria-hidden="true" style="font-size:${ptToPx(wm.fontSize ?? Math.min(paginated.pageSize.width, paginated.pageSize.height) / 6)}px;color:${escapeHtml(wm.color ?? "#9ca3af")};opacity:${wm.opacity ?? 0.18};transform:translate(-50%,-50%) rotate(${-(wm.angle ?? 45)}deg)">${escapeHtml(wm.text)}</div>`
            : "";
        return `<section class="page" style="width:${pageWidthPx}px;height:${pageHeightPx}px;">${background}${header}${content}${footer}${mark}</section>`;
      })
    );

    const theme = input.resolved.theme;
    const bodyFont = theme?.fonts?.body ?? "Arial, sans-serif";

    const html = `<!doctype html>
<html lang="${input.resolved.locale}">
<head>
<meta charset="utf-8" />
<title>${escapeTitle(input.resolved.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #e5e5e5; font-family: ${bodyFont}; }
  .watermark { position: absolute; left: 50%; top: 50%; font-weight: bold; white-space: nowrap; pointer-events: none; user-select: none; }
  .page { position: relative; background: #fff; margin: 0 auto 16px auto; overflow: hidden; box-shadow: 0 0 4px rgba(0,0,0,0.2); }
  @media print {
    body { background: #fff; }
    .page { margin: 0; box-shadow: none; page-break-after: always; }
  }
  @page { size: ${pageWidthPx}px ${pageHeightPx}px; margin: 0; }
</style>
</head>
<body>
${pagesHtml.join("\n")}
</body>
</html>`;

    return {
      content: html,
      mimeType: this.capabilities.mimeType,
      extension: this.capabilities.extension,
      warnings: [...input.resolved.warnings, ...paginated.warnings],
    };
  }
}

function escapeTitle(name: string): string {
  return name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
