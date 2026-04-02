const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);

const KEY_DISPLAY_MAP: Record<string, string> = {
  Control: "Ctrl",
  Meta: "Super",
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
};

function normalizeKeyName(event: KeyboardEvent): string {
  if (MODIFIER_KEYS.has(event.key)) {
    return KEY_DISPLAY_MAP[event.key] ?? event.key;
  }

  if (KEY_DISPLAY_MAP[event.key]) {
    return KEY_DISPLAY_MAP[event.key];
  }

  if (event.key.length === 1) {
    return event.key.toUpperCase();
  }

  return event.key;
}

function normalizeShortcutPart(value: string): string {
  switch (value.toLowerCase()) {
    case "control":
    case "ctrl":
      return "Ctrl";
    case "meta":
    case "super":
    case "cmd":
    case "command":
      return "Super";
    case "alt":
      return "Alt";
    case "shift":
      return "Shift";
    case "space":
      return "Space";
    case "arrowup":
    case "up":
      return "Up";
    case "arrowdown":
    case "down":
      return "Down";
    case "arrowleft":
    case "left":
      return "Left";
    case "arrowright":
    case "right":
      return "Right";
    default:
      return value.length === 1 ? value.toUpperCase() : value;
  }
}

export function buildShortcutString(event: KeyboardEvent): string {
  const parts: string[] = [];

  if (event.ctrlKey) {
    parts.push("Ctrl");
  }

  if (event.altKey) {
    parts.push("Alt");
  }

  if (event.shiftKey) {
    parts.push("Shift");
  }

  if (event.metaKey) {
    parts.push("Super");
  }

  if (!MODIFIER_KEYS.has(event.key)) {
    parts.push(normalizeKeyName(event));
  }

  return parts.join("+");
}

export function isShortcutRecordComplete(event: KeyboardEvent, combo: string): boolean {
  return !MODIFIER_KEYS.has(event.key) && combo.split("+").length >= 2;
}

export function formatRecordedShortcut(combo: string): string {
  return combo
    .split("+")
    .map((part) => normalizeShortcutPart(part.trim()))
    .filter(Boolean)
    .join("+");
}

export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const normalizedShortcut = formatRecordedShortcut(shortcut);

  if (!normalizedShortcut) {
    return false;
  }

  return buildShortcutString(event) === normalizedShortcut;
}
