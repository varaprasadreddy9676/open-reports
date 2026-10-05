import { isEmbedMessage, PROTOCOL, type DesignerToHost, type HostToDesigner } from "@reporting/embed";
import { useStore } from "../store";
import { settings } from "./api";
import * as ops from "../model/ops";

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
  store.getState().set({ embedded: true, home: false });

  window.addEventListener("message", async (event) => {
    if (event.source !== window.parent || event.origin !== origin || !isEmbedMessage(event.data)) return;
    const message = event.data as HostToDesigner;
    const s = store.getState();
    try {
      if (message.type === "init") {
        if (message.apiKey) settings.apiKey = message.apiKey;
        if (message.template) await s.openTemplate(message.template);
        store.getState().set({ home: false });
      } else if (message.type === "save") {
        await s.save();
        if (store.getState().saveState === "error") post({ type: "error", message: "The report could not be saved. Check the designer for details." });
      } else if (message.type === "load") {
        s.loadDoc(ops.ensureIds(message.definition as ops.Doc));
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
  });

  post({ type: "ready" });
  return true;
}
