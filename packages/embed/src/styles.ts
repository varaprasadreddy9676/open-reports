/** Viewer styles, scoped to its shadow root. Override with CSS custom properties or ::part(). */
export const VIEWER_STYLES = `
:host { display: block; --or-accent: #2563eb; --or-border: #dfe5ee; --or-bg: #f6f8fb; --or-text: #1a2b49; --or-muted: #5d6c82; --or-danger: #b91c1c; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--or-text); }
.viewer { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 480px; border: 1px solid var(--or-border); border-radius: 10px; overflow: hidden; background: var(--or-bg); }
.toolbar { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 10px; padding: 10px 12px; background: #fff; border-bottom: 1px solid var(--or-border); }
.params { display: flex; flex-wrap: wrap; gap: 10px; }
.param { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--or-muted); }
.param input, .param select, .param textarea { font: inherit; color: var(--or-text); padding: 5px 8px; border: 1px solid var(--or-border); border-radius: 6px; min-width: 140px; background: #fff; }
.param input[type=checkbox] { min-width: 0; align-self: flex-start; }
.actions { display: flex; flex-wrap: wrap; gap: 6px; }
button { font: inherit; padding: 6px 12px; border: 1px solid var(--or-border); border-radius: 6px; background: #fff; color: var(--or-text); cursor: pointer; }
button:hover { border-color: var(--or-accent); }
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--or-accent); outline-offset: 1px; }
button.primary { background: var(--or-accent); border-color: var(--or-accent); color: #fff; font-weight: 600; }
.status { padding: 0 12px; font-size: 12px; color: var(--or-muted); }
.status:not(:empty) { padding: 6px 12px; }
.status[data-kind=error] { color: var(--or-danger); background: #fee2e2; }
.crumbs { display: flex; align-items: center; gap: 10px; padding: 6px 12px; background: #eef4ff; border-bottom: 1px solid var(--or-border); font-size: 12px; }
.crumbs[hidden] { display: none; }
.crumbs .trail { color: var(--or-muted); }
.tools { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #fff; border-bottom: 1px solid var(--or-border); }
.find { display: flex; align-items: center; gap: 4px; margin-left: auto; }
.find input { font: inherit; padding: 4px 8px; border: 1px solid var(--or-border); border-radius: 6px; width: 200px; }
.find button { padding: 3px 9px; }
.find .count { min-width: 64px; font-size: 12px; color: var(--or-muted); }
.body { flex: 1; display: flex; min-height: 0; }
.contents { width: 220px; flex: none; overflow: auto; padding: 8px 6px; background: #fff; border-right: 1px solid var(--or-border); display: flex; flex-direction: column; gap: 2px; }
.contents[hidden] { display: none; }
.contents .entry { text-align: left; border: 0; background: transparent; padding: 4px 8px; border-radius: 6px; font-size: 12px; }
.contents .entry:hover { background: #eef4ff; }
.contents .level-2 { padding-left: 20px; } .contents .level-3 { padding-left: 32px; } .contents .level-4 { padding-left: 44px; }
.page { flex: 1; width: 100%; min-height: 400px; border: 0; background: #fff; }
@media (max-width: 640px) { .contents { position: absolute; z-index: 2; height: 60%; box-shadow: 0 8px 24px rgba(0,0,0,.15); } .find input { width: 120px; } }
`;
