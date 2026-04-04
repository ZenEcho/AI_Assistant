import {
  MAIN_WINDOW_LABEL,
  RESULT_WINDOW_LABEL,
  SETTINGS_WINDOW_LABEL,
} from "@/services/window/windowManager";

export const SYSTEM_INPUT_EXCLUDED_WINDOW_LABELS = [
  MAIN_WINDOW_LABEL,
  SETTINGS_WINDOW_LABEL,
  RESULT_WINDOW_LABEL,
] as const;

export function resolveSystemInputExcludedWindowLabels(): string[] {
  return [...SYSTEM_INPUT_EXCLUDED_WINDOW_LABELS];
}
