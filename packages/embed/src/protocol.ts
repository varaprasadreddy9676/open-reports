/**
 * postMessage protocol between a host page and an embedded designer iframe.
 *
 * designer → host: ready, saved, save-request, dirty, error
 * host → designer: init (template id and API key, so the key never travels in a URL), save, save-result, load
 *
 * Both sides check `event.origin` and `event.source` before acting on a message.
 */
export const PROTOCOL = "open-reports/1";

export type DesignerToHost =
  | { protocol: typeof PROTOCOL; type: "ready" }
  | { protocol: typeof PROTOCOL; type: "initialized" }
  | { protocol: typeof PROTOCOL; type: "loaded"; definition: unknown }
  | { protocol: typeof PROTOCOL; type: "saved"; templateId: string; version: number }
  | { protocol: typeof PROTOCOL; type: "save-request"; requestId: string; definition: unknown }
  | { protocol: typeof PROTOCOL; type: "saved-definition"; definition: unknown }
  | { protocol: typeof PROTOCOL; type: "dirty"; dirty: boolean }
  | { protocol: typeof PROTOCOL; type: "error"; message: string };

export type HostToDesigner =
  | { protocol: typeof PROTOCOL; type: "init"; template?: string; apiKey?: string; definition?: unknown; data?: Record<string, unknown>; parameters?: Record<string, unknown>; saveMode?: "server" | "host"; saveTimeout?: number }
  | { protocol: typeof PROTOCOL; type: "save" }
  | { protocol: typeof PROTOCOL; type: "save-result"; requestId: string; success: boolean; message?: string }
  | { protocol: typeof PROTOCOL; type: "load"; definition: unknown; data?: Record<string, unknown>; parameters?: Record<string, unknown> };

export type EmbedMessage = DesignerToHost | HostToDesigner;

export function isEmbedMessage(data: unknown): data is EmbedMessage {
  return typeof data === "object" && data !== null && (data as { protocol?: unknown }).protocol === PROTOCOL && typeof (data as { type?: unknown }).type === "string";
}
