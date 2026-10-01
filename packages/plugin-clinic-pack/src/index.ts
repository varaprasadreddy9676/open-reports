import { definePlugin } from "@reporting/plugin-sdk";
import { walkComponents, type ReportRenderer } from "@reporting/core";

/** "Sai Varaprasad Reddy" -> "SVR" */
const initials = (name: unknown) =>
  String(name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** maskId("UH12345", 3) -> "••••345": show only the last N characters (privacy on printed documents). */
const maskId = (id: unknown, keep: unknown = 3) => {
  const s = String(id ?? "");
  const k = Math.max(0, Number(keep) || 0);
  return s.length <= k ? s : "•".repeat(s.length - k) + s.slice(s.length - k);
};

const TONES: Record<string, { bg: string; fg: string }> = {
  ok: { bg: "#dcfce7", fg: "#166534" },
  warn: { bg: "#fef3c7", fg: "#92400e" },
  danger: { bg: "#fee2e2", fg: "#991b1b" },
  info: { bg: "#dbeafe", fg: "#1e40af" },
};

/** Plain-text output: one line per text-like component. Demonstrates a renderer plugin in ~20 lines. */
const textRenderer: ReportRenderer = {
  capabilities: { id: "txt", mimeType: "text/plain", extension: "txt", supports: ["text", "field", "table"] },
  async render({ resolved }) {
    const lines: string[] = [];
    for (const c of walkComponents(resolved)) {
      if (c.type === "text") lines.push(String((c as any).text ?? ""));
      else if (c.type === "table") {
        const t = c as any;
        lines.push(t.columns.map((col: any) => col.header).join(" | "));
        for (const row of t.rows) lines.push(t.columns.map((col: any) => row.formatted[col.id] ?? "").join(" | "));
      }
    }
    return { content: lines.join("\n") + "\n", mimeType: "text/plain", extension: "txt", warnings: [] };
  },
};

export default definePlugin({
  name: "clinic-pack",
  version: "0.1.0",
  description: "Patient-ID helpers, status badge component, plain-text renderer, number-range datasource.",
  setup(api) {
    api.registerExpressionFunction("initials", initials, "initials(name) - first letters of each word, upper-cased");
    api.registerExpressionFunction("maskId", maskId, "maskId(id, keep) - hide all but the last `keep` characters");

    api.registerComponent(
      "statusBadge",
      (props) => {
        const tone = TONES[String(props.tone ?? "info")] ?? TONES.info!;
        return [
          {
            type: "container",
            style: { background: tone.bg, padding: { top: 2, right: 6, bottom: 2, left: 6 }, borderRadius: 4 },
            children: [{ type: "text", value: String(props.text ?? ""), style: { color: tone.fg, fontWeight: "bold", fontSize: Number(props.fontSize) || 9 } }],
          },
        ] as any;
      },
      { description: "A coloured status pill.", props: { text: "string", tone: "ok | warn | danger | info", fontSize: "number" } }
    );

    api.registerRenderer({ format: "txt", renderer: textRenderer, mimeType: "text/plain", supports: ["text", "field", "table"] });

    api.registerDataSource("number-range", {
      async execute(definition) {
        const q = (definition.query ?? {}) as { from?: number; to?: number };
        const from = Number(q.from ?? 1);
        const to = Math.min(Number(q.to ?? 10), from + 100000);
        return { value: Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => ({ n: from + i })) } as any;
      },
    });
  },
});
