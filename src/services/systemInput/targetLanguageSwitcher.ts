import {
  SYSTEM_INPUT_TARGET_LANGUAGE_SWITCH_SHORTCUT_LABEL,
} from "@/constants/app";
import { resolveLanguageLabel, targetLanguageOptions } from "@/constants/languages";

export interface SystemInputTargetLanguageOption {
  label: string;
  value: string;
}

export interface SystemInputTargetLanguageOverlayPayload {
  value: string;
  label: string;
  shortcutLabel: string;
}

export const systemInputTargetLanguageOptions = Object.freeze(
  targetLanguageOptions as SystemInputTargetLanguageOption[],
);

export function formatSystemInputTargetLanguageShortcutLabel(shortcut: string | null | undefined) {
  const normalizedShortcut = typeof shortcut === "string" ? shortcut.trim() : "";

  if (!normalizedShortcut) {
    return SYSTEM_INPUT_TARGET_LANGUAGE_SWITCH_SHORTCUT_LABEL;
  }

  return normalizedShortcut.replace(/`/g, "~");
}

export function resolveSystemInputTargetLanguageValue(value: string | null | undefined): string {
  const normalizedValue = typeof value === "string" ? value.trim() : "";

  return (
    systemInputTargetLanguageOptions.find((option) => option.value === normalizedValue)?.value ??
    systemInputTargetLanguageOptions[0]?.value ??
    ""
  );
}

export function resolveSystemInputTargetLanguageLabel(value: string | null | undefined): string {
  const resolvedValue = resolveSystemInputTargetLanguageValue(value);

  return resolveLanguageLabel(
    systemInputTargetLanguageOptions.find((option) => option.value === resolvedValue)?.value ??
      resolvedValue,
  );
}

export function resolveNextSystemInputTargetLanguage(value: string | null | undefined): string {
  const resolvedValue = resolveSystemInputTargetLanguageValue(value);
  const currentIndex = systemInputTargetLanguageOptions.findIndex(
    (option) => option.value === resolvedValue,
  );

  if (currentIndex < 0) {
    return systemInputTargetLanguageOptions[0]?.value ?? "";
  }

  return systemInputTargetLanguageOptions[
    (currentIndex + 1) % systemInputTargetLanguageOptions.length
  ]?.value ?? resolvedValue;
}

export function createSystemInputTargetLanguageOverlayPayload(
  value: string | null | undefined,
  shortcut?: string | null,
): SystemInputTargetLanguageOverlayPayload {
  const resolvedValue = resolveSystemInputTargetLanguageValue(value);

  return {
    value: resolvedValue,
    label: resolveSystemInputTargetLanguageLabel(resolvedValue),
    shortcutLabel: formatSystemInputTargetLanguageShortcutLabel(shortcut),
  };
}
