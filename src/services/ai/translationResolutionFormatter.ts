import { resolveLanguageLabel } from "@/constants/languages";
import type { TranslationLanguageResolution } from "@/types/language";

export function formatTranslationResolutionSummary(
  resolution: TranslationLanguageResolution | null | undefined,
) {
  if (!resolution?.usedAutoTarget) {
    return "";
  }

  switch (resolution.reason) {
    case "system-language-target":
      return `Auto target resolved to ${resolveLanguageLabel(resolution.resolvedTargetLanguage)} from the current system language; whether to switch to English is decided by the model in the same request.`;
    case "manual-target":
    default:
      return "";
  }
}

export function formatTranslationResolutionTag(
  resolution: TranslationLanguageResolution | null | undefined,
) {
  if (!resolution?.usedAutoTarget) {
    return "";
  }

  return `Auto -> ${resolveLanguageLabel(resolution.resolvedTargetLanguage)}`;
}
