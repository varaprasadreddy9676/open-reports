/** A key combination. `mod` is ⌘ on a Mac and Ctrl elsewhere (either is accepted everywhere). */
export interface Combo {
  /** Matched against `event.key`, case-insensitively. */
  key?: string;
  /** Matched against `event.code`; use for Alt combos, since ⌥ changes the character on a Mac. */
  code?: string;
  mod?: boolean;
  shift?: boolean | "any";
  alt?: boolean;
}

const KEY_LABELS: Record<string, [mac: string, other: string]> = {
  arrowup: ["↑", "↑"],
  arrowdown: ["↓", "↓"],
  arrowleft: ["←", "←"],
  arrowright: ["→", "→"],
  escape: ["Esc", "Esc"],
  enter: ["↵", "Enter"],
  tab: ["⇥", "Tab"],
  delete: ["⌦", "Delete"],
  backspace: ["⌫", "Backspace"],
  " ": ["Space", "Space"],
};

const CODE_LABELS: Record<string, string> = { Equal: "=", Minus: "−", BracketRight: "]", BracketLeft: "[", Slash: "/", Backslash: "\\" };

export function matchesCombo(combo: Combo, event: KeyboardEvent): boolean {
  const mod = event.ctrlKey || event.metaKey;
  if (Boolean(combo.mod) !== mod) return false;
  if (Boolean(combo.alt) !== event.altKey) return false;
  if (combo.shift !== "any" && Boolean(combo.shift) !== event.shiftKey) return false;
  if (combo.code) return event.code === combo.code;
  return event.key.toLowerCase() === combo.key?.toLowerCase();
}

function keyLabel(combo: Combo, mac: boolean): string {
  if (combo.code) {
    if (combo.code.startsWith("Key")) return combo.code.slice(3);
    if (combo.code.startsWith("Digit")) return combo.code.slice(5);
    return CODE_LABELS[combo.code] ?? combo.code;
  }
  const key = combo.key ?? "";
  const named = KEY_LABELS[key.toLowerCase()];
  if (named) return mac ? named[0] : named[1];
  return key.length === 1 ? key.toUpperCase() : key;
}

/** "⇧⌘Z" on a Mac, "Ctrl+Shift+Z" elsewhere. Mac order follows Apple's convention: ⌃⌥⇧⌘. */
export function formatCombo(combo: Combo, mac: boolean): string {
  const shift = combo.shift === true;
  const label = keyLabel(combo, mac);
  if (mac) return `${combo.alt ? "⌥" : ""}${shift ? "⇧" : ""}${combo.mod ? "⌘" : ""}${label}`;
  return [combo.mod && "Ctrl", combo.alt && "Alt", shift && "Shift", label].filter(Boolean).join("+");
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad/i.test(platform);
}
