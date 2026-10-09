import { isEmbedMessage, PROTOCOL, type DesignerToHost, type HostToDesigner } from "@reporting/embed";
import { useStore } from "../store";
import { api, setEmbeddedConnection } from "./api";
import { parseReportDefinition } from "@reporting/schema";
import * as ops from "../model/ops";
import { registerHostSaveHandler, unregisterHostSaveHandler } from "./embed-save";

type WithoutProtocol<T> = T extends unknown ? Omit<T, "protocol"> : never;

/**
 * When the designer runs inside <open-report-designer> (URL ?embed=designer&parent=<origin>), talk to the
 * host page over postMessage. Only messages from the declared parent origin and window are accepted, and
 * replies are posted to that origin only. Returns false when not embedded.
 */
export function startEmbedHost(): boolean {
  const params = new URLSearchParams(location.search);
  const parentOrigin = params.get("parent");
  if (params.get("embed") !== "designer" || !parentOrigin || window.parent === window) return false;
  let origin: string;
  try {
    origin = new URL(parentOrigin).origin;
  } catch {
    return false;
  }

  const post = (message: WithoutProtocol<DesignerToHost>) => window.parent.postMessage({ protocol: PROTOCOL, ...message }, origin);
  const store = useStore;
  setEmbeddedConnection();
  store.getState().set({ embedded: true, home: false });
  const pendingHostSaves = new Map<string, { resolve(): void; reject(error: Error): void; definition: ops.Doc; timer: ReturnType<typeof setTimeout> }>();
  let savedDefinition: ops.Doc | undefined;
  let saveRequest = 0;
  let saveTimeout = 30_000;
  registerHostSaveHandler((definition) => new Promise<void>((resolve, reject) => {
    const requestId = `save-${++saveRequest}`;
    const fail = (error: Error) => { post({ type: "error", message: error.message }); reject(error); };
    const timer = setTimeout(() => {
      pendingHostSaves.delete(requestId);
      fail(new Error("The host application did not confirm saving. Your edits are still here; try saving again."));
    }, saveTimeout);
    pendingHostSaves.set(requestId, { resolve, reject: fail, definition, timer });
    post({ type: "save-request", requestId, definition });
  }));

  const loadDefinition = (definition: unknown, data?: Record<string, unknown>, parameters?: Record<string, unknown>) => {
    const parsed = parseReportDefinition(definition);
    if (!parsed.valid) throw new Error(`Invalid report: ${parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
    store.getState().loadDoc(ops.ensureIds(parsed.report as ops.Doc), {}, data ?? {});
    store.getState().set({ parameters: parameters ?? {} });
    store.getState().refresh();
  };

  window.addEventListener("message", async (event) => {
    if (event.source !== window.parent || event.origin !== origin || !isEmbedMessage(event.data)) return;
    const message = event.data as HostToDesigner;
    const s = store.getState();
    try {
      if (message.type === "init") {
        setEmbeddedConnection(message.apiKey);
        saveTimeout = Number.isFinite(message.saveTimeout) && message.saveTimeout! > 0 ? message.saveTimeout! : 30_000;
        store.getState().set({ embeddedSaveMode: message.saveMode ?? "server" });
        if (message.definition !== undefined) loadDefinition(message.definition, message.data, message.parameters);
        else if (message.template) {
          const template = await api.getTemplate(message.template);
          const version = await api.getVersion(message.template, template.currentVersion);
          const parsed = parseReportDefinition(version.definition);
          if (!parsed.valid) throw new Error("The saved template has an invalid report definition.");
          store.getState().loadDoc(parsed.report as ops.Doc, { id: template.id, version: template.currentVersion, status: version.status, dirty: false }, message.data ?? {});
          store.getState().set({ parameters: message.parameters ?? {} });
          store.getState().refresh();
        }
        store.getState().set({ home: false });
        post({ type: "initialized" });
      } else if (message.type === "save-result") {
        const pending = pendingHostSaves.get(message.requestId);
        if (!pending) return;
        pendingHostSaves.delete(message.requestId);
        clearTimeout(pending.timer);
        if (message.success) {
          savedDefinition = pending.definition;
          pending.resolve();
        } else pending.reject(new Error(message.message || "The host application could not save this report."));
      } else if (message.type === "save") {
        await s.save();
        if (store.getState().embeddedSaveMode === "server" && store.getState().saveState === "error") post({ type: "error", message: "The report could not be saved. Check the designer for details." });
      } else if (message.type === "load") {
        loadDefinition(message.definition, message.data, message.parameters);
        post({ type: "loaded", definition: store.getState().doc });
      }
    } catch (error) {
      post({ type: "error", message: error instanceof Error ? error.message : String(error) });
    }
  });

  // Report saves (from the host or the designer's own Save button) and unsaved-change state.
  store.subscribe((state, previous) => {
    if (state.meta.version !== previous.meta.version && state.meta.id && state.meta.version !== undefined && !state.meta.dirty) {
      post({ type: "saved", templateId: state.meta.id, version: state.meta.version });
    }
    if (state.meta.dirty !== previous.meta.dirty) post({ type: "dirty", dirty: Boolean(state.meta.dirty) });
    if (savedDefinition && state.saveState !== "saving") {
      const definition = savedDefinition;
      savedDefinition = undefined;
      post({ type: "saved-definition", definition });
    }
  });

  window.addEventListener("pagehide", unregisterHostSaveHandler, { once: true });

  post({ type: "ready" });
  return true;
}
