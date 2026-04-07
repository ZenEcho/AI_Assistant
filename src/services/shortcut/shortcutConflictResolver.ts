import type { ShortcutRegistrationResult } from "@/services/shortcut/globalShortcutService";

export interface ShortcutRegistrationAttempt {
  originalShortcut: string;
  finalShortcut: string;
  fallbackShortcut: string | null;
  usedFallback: boolean;
  result: ShortcutRegistrationResult;
}

function splitShortcut(shortcut: string): string[] {
  return shortcut
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function isModifier(part: string, expected: string): boolean {
  return part.toLowerCase() === expected.toLowerCase();
}

export function buildCtrlToAltFallbackShortcut(shortcut: string): string | null {
  const parts = splitShortcut(shortcut);
  const ctrlIndex = parts.findIndex((part) => isModifier(part, "Ctrl"));
  const hasAlt = parts.some((part) => isModifier(part, "Alt"));

  if (ctrlIndex < 0 || hasAlt) {
    return null;
  }

  const nextParts = [...parts];
  nextParts[ctrlIndex] = "Alt";
  return nextParts.join("+");
}

export function buildShortcutSuggestion(shortcut: string): string {
  const parts = splitShortcut(shortcut);

  if (parts.length === 0) {
    return "Alt+Shift+1";
  }

  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1).filter((part) => !isModifier(part, "Ctrl"));

  if (!modifiers.some((part) => isModifier(part, "Alt"))) {
    modifiers.unshift("Alt");
  }

  if (!modifiers.some((part) => isModifier(part, "Shift"))) {
    modifiers.push("Shift");
  }

  return [...modifiers, key].join("+");
}

export function buildShortcutConflictAssistMessage(
  originalShortcut: string,
  fallbackShortcut?: string | null,
): string {
  const suggestion = buildShortcutSuggestion(fallbackShortcut ?? originalShortcut);

  if (fallbackShortcut) {
    return `${originalShortcut} 已被占用，已自动尝试 ${fallbackShortcut}，但它也被占用了。建议改成 ${suggestion}，或点击“重新设置”后直接录入新的组合键。`;
  }

  return `${originalShortcut} 已被占用。建议改成 ${suggestion}，或点击“重新设置”后直接录入新的组合键。`;
}

export async function registerShortcutWithCtrlFallback(
  shortcut: string,
  register: (value: string) => Promise<ShortcutRegistrationResult>,
): Promise<ShortcutRegistrationAttempt> {
  const firstResult = await register(shortcut);
  const fallbackShortcut = firstResult.conflict ? buildCtrlToAltFallbackShortcut(shortcut) : null;

  if (firstResult.success || !firstResult.conflict || !fallbackShortcut) {
    return {
      originalShortcut: shortcut,
      finalShortcut: shortcut,
      fallbackShortcut,
      usedFallback: false,
      result: firstResult,
    };
  }

  const fallbackResult = await register(fallbackShortcut);

  return {
    originalShortcut: shortcut,
    finalShortcut: fallbackShortcut,
    fallbackShortcut,
    usedFallback: fallbackResult.success,
    result: fallbackResult,
  };
}
