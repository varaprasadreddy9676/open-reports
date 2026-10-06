import type { ServerOptions } from "./client.js";
import { isEmbedMessage, PROTOCOL, type DesignerToHost, type HostToDesigner } from "./protocol.js";

/** Each message shape minus the protocol tag, kept as a union so per-type fields stay checked. */
type WithoutProtocol<T> = T extends unknown ? Omit<T, "protocol"> : never;

export interface DesignerOptions extends ServerOptions {
  /** Template to open; omit to start with a blank report. */
  template?: string;
  /** Initial report JSON. When supplied with saveMode "host", the host remains the source of truth. */
  definition?: unknown;
  /** Where edits are persisted. Defaults to "server" to preserve existing integrations. */
  saveMode?: "server" | "host";
  /** Persist a changed report in the host application. Required when saveMode is "host". */
  onSaveDefinition?(definition: unknown): void | Promise<void>;
  /** Height of the designer frame. Default "720px". */
  height?: string;
  onReady?(): void;
  onSave?(saved: { templateId: string; version: number }): void;
  onDirtyChange?(dirty: boolean): void;
  onError?(message: string): void;
}

export interface Designer {
  /** Ask the designer to save; resolves after either the server or host confirms persistence. */
  save(): Promise<{ templateId: string; version: number } | { definition: unknown }>;
  /** Replace the open report with this definition. */
  load(definition: unknown): void;
  readonly frame: HTMLIFrameElement;
  destroy(): void;
}

/**
 * Embeds the full Open Reports designer in `host`. The designer runs from your Open Reports server in an
 * iframe; this function only talks to it with postMessage, checking the origin of every message.
 */
export function createDesigner(host: HTMLElement, options: DesignerOptions): Designer {
  const server = new URL(options.server, location.href);
  const src = new URL("/", server);
  src.searchParams.set("embed", "designer");
  src.searchParams.set("parent", location.origin);
  const frame = document.createElement("iframe");
  frame.src = src.href;
  frame.title = "Report designer";
  frame.setAttribute("allow", "clipboard-read; clipboard-write");
  Object.assign(frame.style, { width: "100%", height: options.height ?? "720px", border: "0", display: "block" });
  host.replaceChildren(frame);

  type SaveResult = { templateId: string; version: number } | { definition: unknown };
  const pendingSaves: { resolve(value: SaveResult): void; reject(error: Error): void }[] = [];
  // Messages sent before the designer has loaded would be lost, so queue them until it reports "ready".
  let ready = false;
  const queued: WithoutProtocol<HostToDesigner>[] = [];
  const send = (message: WithoutProtocol<HostToDesigner>) => frame.contentWindow?.postMessage({ protocol: PROTOCOL, ...message }, server.origin);
  const post = (message: WithoutProtocol<HostToDesigner>) => (ready ? send(message) : queued.push(message));

  const onMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== server.origin || !isEmbedMessage(event.data)) return;
    const message = event.data as DesignerToHost;
    if (message.type === "ready") {
      // A reload of the frame reports ready again; init again so it reopens the same template.
      send({ type: "init", template: options.template, apiKey: options.apiKey, definition: options.definition, saveMode: options.saveMode });
      ready = true;
      queued.splice(0).forEach(send);
      options.onReady?.();
      host.dispatchEvent(new CustomEvent("designer-ready", { bubbles: true, composed: true }));
    } else if (message.type === "saved") {
      const saved = { templateId: message.templateId, version: message.version };
      pendingSaves.splice(0).forEach((pending) => pending.resolve(saved));
      options.onSave?.(saved);
      host.dispatchEvent(new CustomEvent("report-saved", { detail: saved, bubbles: true, composed: true }));
    } else if (message.type === "save-request") {
      void Promise.resolve(options.onSaveDefinition?.(message.definition)).then(() => {
        const success = typeof options.onSaveDefinition === "function";
        send({ type: "save-result", requestId: message.requestId, success, ...(success ? {} : { message: "Configure onSaveDefinition to persist reports in host-managed mode." }) });
      }, (error: unknown) => {
        send({ type: "save-result", requestId: message.requestId, success: false, message: error instanceof Error ? error.message : String(error) });
      });
    } else if (message.type === "saved-definition") {
      const saved = { definition: message.definition };
      pendingSaves.splice(0).forEach((pending) => pending.resolve(saved));
      host.dispatchEvent(new CustomEvent("report-saved", { detail: saved, bubbles: true, composed: true }));
    } else if (message.type === "dirty") {
      options.onDirtyChange?.(message.dirty);
      host.dispatchEvent(new CustomEvent("report-dirty", { detail: { dirty: message.dirty }, bubbles: true, composed: true }));
    } else if (message.type === "error") {
      pendingSaves.splice(0).forEach((pending) => pending.reject(new Error(message.message)));
      options.onError?.(message.message);
      host.dispatchEvent(new CustomEvent("report-error", { detail: { message: message.message }, bubbles: true, composed: true }));
    }
  };
  window.addEventListener("message", onMessage);

  return {
    frame,
    save() {
      return new Promise((resolve, reject) => {
        pendingSaves.push({ resolve, reject });
        post({ type: "save" });
      });
    },
    load(definition) {
      post({ type: "load", definition });
    },
    destroy() {
      window.removeEventListener("message", onMessage);
      pendingSaves.splice(0).forEach((pending) => pending.reject(new Error("Designer closed")));
      host.replaceChildren();
    },
  };
}
