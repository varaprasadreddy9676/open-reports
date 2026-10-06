import type { Doc } from "../model/ops";

let hostSaveHandler: ((definition: Doc) => Promise<void>) | undefined;

/** Registered by the iframe bridge when its host owns report persistence. */
export function registerHostSaveHandler(handler: (definition: Doc) => Promise<void>): void {
  hostSaveHandler = handler;
}

export function unregisterHostSaveHandler(): void {
  hostSaveHandler = undefined;
}

export async function saveDefinitionToHost(definition: Doc): Promise<void> {
  if (!hostSaveHandler) throw new Error("The embedding application has not configured a report save handler.");
  await hostSaveHandler(definition);
}
