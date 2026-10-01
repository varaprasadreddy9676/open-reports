import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { loadAiSettings, requestProposal, saveAiSettings, type AiSettings } from "../lib/ai";

/** Selection-scoped, BYOK AI editing. The model only ever returns JSON Patch ops against the report; the engine does all calculation and rendering. */
export function AiBar() {
  const { aiOpen, aiBusy, aiProposal, selection, engine } = useStore();
  const set = useStore((s) => s.set);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [showOps, setShowOps] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (aiOpen) input.current?.focus();
  }, [aiOpen]);

  if (!aiOpen && !aiProposal) return null;

  async function send() {
    const st = useStore.getState();
    const settings = loadAiSettings();
    if (!prompt.trim()) return;
    if (!settings.apiKey && settings.provider === "anthropic") {
      st.set({ dialog: "ai-settings" });
      return;
    }
    setError("");
    st.set({ aiBusy: true, aiProposal: null });
    try {
      const proposal = await requestProposal(settings, prompt.trim(), st.doc, st.sample, st.selection, st.engine.problems);
      st.set({ aiProposal: proposal });
      st.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      useStore.getState().set({ aiBusy: false });
    }
  }

  const errorsNow = engine.problems.filter((p) => p.severity === "error").length;
  return (
    <div className="ai-bar" role="region" aria-label="AI assistant" data-testid="ai-bar">
      {aiProposal && (
        <div className="ai-proposal" data-testid="ai-proposal">
          <div className="ai-head">
            <strong>Proposed change</strong>
            <span className="muted small">shown on the canvas - nothing is applied until you accept</span>
          </div>
          {aiProposal.explanation && <p className="ai-explain">{aiProposal.explanation}</p>}
          <ul className="ai-changes" data-testid="ai-changes">
            {aiProposal.changes.length === 0 && <li className="muted">No visible change.</li>}
            {aiProposal.changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          {errorsNow > 0 && <p className="field-error">This version has {errorsNow} error(s) - check Problems before accepting.</p>}
          <label className="check small">
            <input type="checkbox" checked={showOps} onChange={(e) => setShowOps(e.target.checked)} /> Show technical patch
          </label>
          {showOps && <pre className="csv" data-testid="ai-ops">{JSON.stringify(aiProposal.ops, null, 1)}</pre>}
          <div className="ai-actions">
            <button className="btn primary" data-testid="ai-accept" onClick={() => useStore.getState().acceptAi()}>
              Accept
            </button>
            <button className="btn" data-testid="ai-reject" onClick={() => useStore.getState().rejectAi()}>
              Reject
            </button>
          </div>
        </div>
      )}
      {aiOpen && (
        <div className="ai-input">
          <span className="ai-scope" data-testid="ai-scope" title="The AI only sees and edits this scope">
            {selection.length ? `✦ ${selection.length} selected` : "✦ Whole report"}
          </span>
          <input
            ref={input}
            data-testid="ai-prompt"
            aria-label="Ask AI to change the report"
            placeholder={selection.length ? "e.g. make this a bold red heading" : "e.g. add a signature block at the end"}
            value={prompt}
            disabled={aiBusy}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") send();
              if (e.key === "Escape") set({ aiOpen: false });
            }}
          />
          <button className="btn primary" data-testid="ai-send" disabled={aiBusy || !prompt.trim()} onClick={send}>
            {aiBusy ? "Thinking…" : "Ask"}
          </button>
          <button className="icon-btn" aria-label="AI settings" title="AI settings (your own API key)" data-testid="ai-settings" onClick={() => set({ dialog: "ai-settings" })}>
            ⚙
          </button>
          <button className="icon-btn" aria-label="Close AI" onClick={() => set({ aiOpen: false })}>
            ×
          </button>
        </div>
      )}
      {error && (
        <div className="field-error" role="alert" data-testid="ai-error">
          {error}
        </div>
      )}
    </div>
  );
}

export function AiSettingsBody({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<AiSettings>(loadAiSettings);
  return (
    <>
      <h2>AI assistant - bring your own key</h2>
      <p className="muted">
        The AI proposes changes to your report's JSON, which you review as a diff. It never calculates or renders anything. Your key is stored <strong>only in this browser</strong> and is sent only to the provider you choose - never to the report server.
        What is sent: your request, the selected components (or an outline), dataset <em>field names</em>, and current problems. Sample data values are not sent.
      </p>
      <div className="grid2">
        <label className="field">
          <span className="field-label">Provider</span>
          <select data-testid="ai-provider" value={s.provider} onChange={(e) => setS({ ...s, provider: e.target.value as AiSettings["provider"], model: e.target.value === "anthropic" ? "claude-sonnet-5-5" : "gpt-4o" })}>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI-compatible (OpenAI, Azure, Ollama, LM Studio…)</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Model</span>
          <input data-testid="ai-model" value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} />
        </label>
      </div>
      {s.provider === "openai" && (
        <label className="field wide">
          <span className="field-label">Base URL</span>
          <input data-testid="ai-base-url" value={s.baseUrl} onChange={(e) => setS({ ...s, baseUrl: e.target.value })} />
        </label>
      )}
      <label className="field wide">
        <span className="field-label">API key</span>
        <input type="password" data-testid="ai-key" autoComplete="off" value={s.apiKey} onChange={(e) => setS({ ...s, apiKey: e.target.value })} placeholder={s.provider === "openai" ? "optional for local models" : "sk-ant-…"} />
      </label>
      <div className="dialog-actions">
        <button
          className="btn"
          onClick={() => {
            saveAiSettings({ ...s, apiKey: "" });
            setS({ ...s, apiKey: "" });
          }}
        >
          Forget key
        </button>
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button
          className="btn primary"
          data-testid="ai-settings-save"
          onClick={() => {
            saveAiSettings(s);
            onClose();
            useStore.getState().set({ aiOpen: true });
          }}
        >
          Save
        </button>
      </div>
    </>
  );
}
