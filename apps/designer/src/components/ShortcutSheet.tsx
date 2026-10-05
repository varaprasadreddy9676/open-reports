import { useMemo, useState } from "react";
import { useStore } from "../store";
import { COMMANDS, type CommandGroup } from "../lib/commands";
import { formatCombo, isMacPlatform } from "../lib/shortcuts";
import { Modal } from "./Shell";

const GROUPS: CommandGroup[] = ["General", "View", "Select", "Edit", "Arrange"];
/** Extra canvas gestures that are not key commands. */
const GESTURES: { label: string; keys: string[] }[] = [
  { label: "Pan the canvas", keys: ["Space + drag", "Middle-drag"] },
  { label: "Zoom around the cursor", keys: ["Pinch", "mod + scroll"] },
  { label: "Duplicate while dragging", keys: ["alt + drag"] },
  { label: "Drag without snapping", keys: ["alt while dragging"] },
];

/** Every shortcut, grouped, searchable, with ⌘ on a Mac and Ctrl elsewhere. Opened with "?". */
export function ShortcutSheet() {
  const set = useStore((s) => s.set);
  const [query, setQuery] = useState("");
  const mac = isMacPlatform();
  const mod = mac ? "⌘" : "Ctrl";
  const alt = mac ? "⌥" : "Alt";
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return COMMANDS.filter((command) => command.id !== "leave-home" && (!q || command.label.toLowerCase().includes(q)));
  }, [query]);
  const gestures = GESTURES.filter((gesture) => !query.trim() || gesture.label.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <Modal label="Keyboard shortcuts" wide onClose={() => set({ dialog: null })}>
      <div className="shortcut-sheet" data-testid="shortcut-sheet">
        <header>
          <h2>Keyboard shortcuts</h2>
          <input autoFocus type="search" aria-label="Search shortcuts" placeholder="Search shortcuts" value={query} onChange={(e) => setQuery(e.target.value)} />
        </header>
        <div className="shortcut-groups">
          {GROUPS.map((group) => {
            const commands = visible.filter((command) => command.group === group);
            if (!commands.length) return null;
            return (
              <section key={group} aria-label={group}>
                <h3>{group}</h3>
                <dl>
                  {commands.map((command) => (
                    <div key={command.id} className="shortcut-row">
                      <dt>{command.label}</dt>
                      <dd>{command.combos.map((combo, index) => <kbd key={index}>{formatCombo(combo, mac)}</kbd>)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
          {gestures.length > 0 && (
            <section aria-label="Mouse and trackpad">
              <h3>Mouse and trackpad</h3>
              <dl>
                {gestures.map((gesture) => (
                  <div key={gesture.label} className="shortcut-row">
                    <dt>{gesture.label}</dt>
                    <dd>{gesture.keys.map((keys) => <kbd key={keys}>{keys.replace("mod", mod).replace("alt", alt)}</kbd>)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>
    </Modal>
  );
}
