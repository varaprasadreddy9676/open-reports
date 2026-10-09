import type { ServerOptions } from "./client.js";
import { isEmbedMessage, PROTOCOL, type DesignerToHost, type HostToDesigner } from "./protocol.js";

/** Each message shape minus the protocol tag, kept as a union so per-type fields stay checked. */
type WithoutProtocol<T> = T extends unknown ? Omit<T, "protocol"> : never;

export interface DesignerOptions extends ServerOptions {
  /** Template to open; omit to start with a blank report. */
  template?: string;
  /** Initial report JSON. When supplied with saveMode "host", the host remains the source of truth. */
  definition?: unknown;
  /** Preview data supplied by the host; kept separate from the saved definition. */
  data?: Record<string, unknown>;
  /** Starting preview parameter values. */
  parameters?: Record<string, unknown>;
  /** Where edits are persisted. Defaults to "server" to preserve existing integrations. */
  saveMode?: "server" | "host";
  /** Persist a changed report in the host application. Required when saveMode is "host". */
  onSaveDefinition?(definition: unknown): void | Promise<void>;
  /** Height of the designer frame. Default "720px". */
  height?: string;
  /** Maximum wait for initialization or host/server persistence. Default 30 seconds. */
  saveTimeout?: number;
  onReady?(): void;
  onSave?(saved: { templateId: string; version: number }): void;
  onDirtyChange?(dirty: boolean): void;
  onError?(message: string): void;
}

export interface Designer {
  /** Ask the designer to save; resolves after either the server or host confirms persistence. */
  save(): Promise<{ templateId: string; version: number } | { definition: unknown }>;
  /** Replace the open report with this definition. */
  load(definition: unknown, preview?: { data?: Record<string, unknown>; parameters?: Record<string, unknown> }): void;
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
  let currentDefinition = options.definition;
  let currentData = options.data;
  let currentParameters = options.parameters;
  let destroyed = false;
  let generation = 0;
  let frameGeneration = 0;
  const saveTimeout = Number.isFinite(options.saveTimeout) && options.saveTimeout! > 0 ? options.saveTimeout! : 30_000;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const settle = (result: SaveResult | Error) => {
    clearTimeout(saveTimer);
    pendingSaves.splice(0).forEach((pending) => result instanceof Error ? pending.reject(result) : pending.resolve(result));
  };
  // Messages sent before the designer has loaded would be lost, so queue them until it reports "ready".
  let ready = false;
  const queued: WithoutProtocol<HostToDesigner>[] = [];
  const send = (message: WithoutProtocol<HostToDesigner>) => frame.contentWindow?.postMessage({ protocol: PROTOCOL, ...message }, server.origin);
  const post = (message: WithoutProtocol<HostToDesigner>) => (ready ? send(message) : queued.push(message));

  const onMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== server.origin || !isEmbedMessage(event.data)) return;
    const message = event.data as DesignerToHost;
    if (message.type === "ready") {
      if (ready) settle(new Error("Designer reloaded before saving finished. Save again after it is ready."));
      ready = false;
      generation++;
      frameGeneration++;
      send({ type: "init", template: options.template, apiKey: options.apiKey, definition: currentDefinition, data: currentData, parameters: currentParameters, saveMode: options.saveMode, saveTimeout });
    } else if (message.type === "initialized") {
      ready = true;
      queued.splice(0).forEach(send);
      options.onReady?.();
      host.dispatchEvent(new CustomEvent("designer-ready", { bubbles: true, composed: true }));
    } else if (message.type === "loaded") {
      currentDefinition = message.definition;
    } else if (message.type === "saved") {
      const saved = { templateId: message.templateId, version: message.version };
      settle(saved);
      options.onSave?.(saved);
      host.dispatchEvent(new CustomEvent("report-saved", { detail: saved, bubbles: true, composed: true }));
    } else if (message.type === "save-request") {
      const savingGeneration = generation;
      const savingFrame = frameGeneration;
      void Promise.resolve().then(() => options.onSaveDefinition?.(message.definition)).then(() => {
        if (destroyed || savingFrame !== frameGeneration) return;
        const success = typeof options.onSaveDefinition === "function";
        if (success && generation === savingGeneration) currentDefinition = message.definition;
        send({ type: "save-result", requestId: message.requestId, success, ...(success ? {} : { message: "Configure onSaveDefinition to persist reports in host-managed mode." }) });
      }, (error: unknown) => {
        if (destroyed || savingFrame !== frameGeneration) return;
        send({ type: "save-result", requestId: message.requestId, success: false, message: error instanceof Error ? error.message : String(error) });
      });
    } else if (message.type === "saved-definition") {
      const saved = { definition: message.definition };
      settle(saved);
      host.dispatchEvent(new CustomEvent("report-saved", { detail: saved, bubbles: true, composed: true }));
    } else if (message.type === "dirty") {
      options.onDirtyChange?.(message.dirty);
      host.dispatchEvent(new CustomEvent("report-dirty", { detail: { dirty: message.dirty }, bubbles: true, composed: true }));
    } else if (message.type === "error") {
      settle(new Error(message.message));
      options.onError?.(message.message);
      host.dispatchEvent(new CustomEvent("report-error", { detail: { message: message.message }, bubbles: true, composed: true }));
    }
  };
  window.addEventListener("message", onMessage);

  return {
    frame,
    save() {
      if (destroyed) return Promise.reject(new Error("Designer closed"));
      return new Promise((resolve, reject) => {
        const saving = pendingSaves.length > 0;
        pendingSaves.push({ resolve, reject });
        if (!saving) {
          saveTimer = setTimeout(() => {
            const at = queued.findIndex((message) => message.type === "save");
            if (at >= 0) queued.splice(at, 1);
            const message = "Saving timed out. Check the host connection and try again; your edits remain in the designer.";
            settle(new Error(message));
            options.onError?.(message);
          }, saveTimeout);
          post({ type: "save" });
        }
      });
    },
    load(definition, preview) {
      if (destroyed) throw new Error("Designer closed");
      generation++;
      if (preview?.data !== undefined) currentData = preview.data;
      if (preview?.parameters !== undefined) currentParameters = preview.parameters;
      post({ type: "load", definition, data: currentData, parameters: currentParameters });
    },
    destroy() {
      window.removeEventListener("message", onMessage);
      destroyed = true;
      queued.splice(0);
      settle(new Error("Designer closed"));
      host.replaceChildren();
    },
  };
}
