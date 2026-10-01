import { applyPatch, summarizeChanges, AUTHORING_GUIDE, type PatchOp } from "@reporting/ai-tools";
import type { Doc } from "../model/ops";
import { walkAll } from "../model/ops";
import { inferFields } from "./fields";

/** BYOK settings live only in this browser (localStorage). They are sent to the chosen model provider and nowhere else - never to the report server. */
export type Provider = "anthropic" | "openai";
export interface AiSettings {
  provider: Provider;
  model: string;
  apiKey: string;
  /** For OpenAI-compatible providers (OpenAI, Azure, local servers such as Ollama/LM Studio, gateways). */
  baseUrl: string;
}

const KEY = "designer.ai";
export const DEFAULT_SETTINGS: AiSettings = { provider: "anthropic", model: "claude-sonnet-5-5", apiKey: "", baseUrl: "https://api.openai.com/v1" };

export function loadAiSettings(): AiSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
export function saveAiSettings(s: AiSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

export interface Proposal {
  prompt: string;
  explanation: string;
  ops: PatchOp[];
  doc: Doc;
  changes: string[];
  scope: string[];
}

const SYSTEM = `${AUTHORING_GUIDE}

You are embedded in a visual report designer. The user's request applies to the SELECTED components when any are given, otherwise to the whole report.
Respond with ONLY a JSON object, no prose, no code fences:
{"explanation": "one or two plain-language sentences", "ops": [ ...RFC 6902 operations... ]}
Path syntax: "#componentId/prop/..." addresses a component by id (e.g. "#title/style/fontSize", "#box/children/-" to append). Use plain "/sections/0/..." pointers only for sections or report-level fields.
If the request cannot be done safely or is unclear, return {"explanation": "why / what you need", "ops": []}.
Never invent dataset fields: use only the fields listed in the context. Never put secrets in the report.`;

function outline(doc: Doc): string[] {
  const lines: string[] = [];
  for (const loc of walkAll(doc)) {
    const c = loc.comp;
    const label = c.name ?? (c.type === "text" ? String(c.binding ?? c.expression ?? c.value ?? "").slice(0, 30) : c.dataset ?? "");
    lines.push(`${"  ".repeat(Math.max(0, (loc.path.match(/\./g)?.length ?? 1) - 1))}${c.id} [${c.type}]${label ? ` ${label}` : ""}`);
  }
  return lines.slice(0, 200);
}

/** What the model is told. Selection-scoped: selected components are given in full, everything else as an outline. */
export function buildContext(doc: Doc, sample: Record<string, unknown>, selection: string[], problems: { severity: string; message: string; componentId?: string }[]): string {
  const datasets = (doc.datasets ?? []).map((d: any) => {
    const data = sample[d.id] ?? d.query?.data;
    const fields = inferFields(data).map((f) => `${f.path}:${f.kind}`);
    return `- ${d.id} (${d.source}) fields: ${fields.slice(0, 40).join(", ") || "unknown"}`;
  });
  const selected = selection
    .map((id) => {
      for (const l of walkAll(doc)) if (l.comp.id === id) return l.comp;
      return undefined;
    })
    .filter(Boolean);
  // Privacy: inline sample data (patient names, amounts...) never leaves the browser; the model gets field names and types only.
  const redacted = { ...doc, datasets: (doc.datasets ?? []).map((d: any) => (d.source === "inline" ? { ...d, query: { data: "[omitted]" } } : d)) };
  const whole = JSON.stringify(redacted);
  return [
    `Report: ${doc.name} (page ${JSON.stringify(doc.page ?? {})}${doc.print ? `, print ${JSON.stringify(doc.print)}` : ""})`,
    `Datasets:\n${datasets.join("\n") || "(none)"}`,
    `Parameters: ${(doc.parameters ?? []).map((p: any) => p.id).join(", ") || "(none)"}; variables: ${(doc.variables ?? []).map((v: any) => v.id).join(", ") || "(none)"}`,
    `Component outline:\n${outline(doc).join("\n")}`,
    selected.length ? `SELECTED components (full JSON):\n${JSON.stringify(selected, null, 1).slice(0, 20000)}` : whole.length < 14000 ? `Full report JSON:\n${whole}` : "No selection; request applies to the whole report (see outline).",
    problems.length ? `Current problems:\n${problems.slice(0, 15).map((p) => `- [${p.severity}] ${p.message}${p.componentId ? ` (#${p.componentId})` : ""}`).join("\n")}` : "Current problems: none",
  ].join("\n\n");
}

/** Pulls the JSON object out of a model reply, tolerating code fences or leading prose. */
export function parseModelReply(text: string): { explanation: string; ops: PatchOp[] } {
  let t = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  if (fence) t = fence[1]!.trim();
  if (!t.startsWith("{")) {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) t = t.slice(start, end + 1);
  }
  let obj: any;
  try {
    obj = JSON.parse(t);
  } catch {
    throw new Error("The model did not return valid JSON. Try again or rephrase.");
  }
  if (!obj || !Array.isArray(obj.ops)) throw new Error('The model reply had no "ops" array.');
  const ops: PatchOp[] = obj.ops;
  for (const [i, op] of ops.entries()) {
    if (!op || typeof op.op !== "string" || typeof (op as any).path !== "string") throw new Error(`Operation ${i + 1} is malformed.`);
  }
  return { explanation: String(obj.explanation ?? ""), ops };
}

export function makeProposal(prompt: string, doc: Doc, scope: string[], reply: { explanation: string; ops: PatchOp[] }): Proposal {
  const r = applyPatch(doc, reply.ops);
  if (!r.ok) throw new Error(`The suggested change could not be applied (${r.errors[0]!.message}). Nothing was changed.`);
  return { prompt, explanation: reply.explanation, ops: reply.ops, doc: r.doc, changes: summarizeChanges(doc, r.doc), scope };
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      msg = j?.error?.message ?? j?.message ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(`The AI provider rejected the request: ${msg}`);
  }
  return res.json();
}

/** Calls the user's own provider directly from the browser. */
export async function askModel(settings: AiSettings, system: string, user: string): Promise<string> {
  if (!settings.apiKey && settings.provider !== "openai") throw new Error("Add your API key in AI settings first.");
  if (settings.provider === "anthropic") {
    const j = await post(
      "https://api.anthropic.com/v1/messages",
      { "x-api-key": settings.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      { model: settings.model, max_tokens: 4096, system, messages: [{ role: "user", content: user }] }
    );
    return (j.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
  }
  const j = await post(`${settings.baseUrl.replace(/\/$/, "")}/chat/completions`, settings.apiKey ? { authorization: `Bearer ${settings.apiKey}` } : {}, {
    model: settings.model,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    temperature: 0.2,
  });
  return j.choices?.[0]?.message?.content ?? "";
}

export async function requestProposal(settings: AiSettings, prompt: string, doc: Doc, sample: Record<string, unknown>, selection: string[], problems: { severity: string; message: string; componentId?: string }[]): Promise<Proposal> {
  const context = buildContext(doc, sample, selection, problems);
  const reply = await askModel(settings, SYSTEM, `${context}\n\nUser request: ${prompt}`);
  return makeProposal(prompt, doc, selection, parseModelReply(reply));
}
