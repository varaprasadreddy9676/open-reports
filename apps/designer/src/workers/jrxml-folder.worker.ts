import { finishJrxmlFolderImport, importJrxmlFolderFile, type JrxmlFolderEntry } from "@reporting/jrxml-import";

type StartMessage = { files: { file: File; path: string }[]; idPrefix: string };

self.onmessage = async (event: MessageEvent<StartMessage>) => {
  const { files, idPrefix } = event.data;
  const entries: JrxmlFolderEntry[] = [];
  let failures = 0;
  let lastUpdate = 0;
  try {
    for (let index = 0; index < files.length; index++) {
      const { file, path } = files[index]!;
      let entry: JrxmlFolderEntry;
      try {
        entry = importJrxmlFolderFile({ path, xml: await file.text() }, index, idPrefix);
      } catch (cause) {
        entry = { path, issues: [], summary: { converted: 0, "needs-review": 0, unsupported: 0 }, error: cause instanceof Error ? cause.message : String(cause) };
      }
      entries.push(entry);
      if (!entry.report) failures++;
      const now = Date.now();
      if (index === 0 || index === files.length - 1 || now - lastUpdate >= 100) {
        self.postMessage({ type: "progress", processed: index + 1, total: files.length, current: path, failures });
        lastUpdate = now;
      }
    }
    self.postMessage({ type: "linking", total: files.length });
    self.postMessage({ type: "done", result: finishJrxmlFolderImport(entries) });
  } catch (cause) {
    self.postMessage({ type: "error", message: cause instanceof Error ? cause.message : String(cause) });
  }
};
