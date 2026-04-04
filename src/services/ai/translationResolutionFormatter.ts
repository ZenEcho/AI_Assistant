import { resolveLanguageLabel } from "@/constants/languages";
import type { TranslationLanguageResolution } from "@/types/language";

export function formatTranslationResolutionSummary(
  resolution: TranslationLanguageResolution | null | undefined,
) {
  if (!resolution?.usedAutoTarget) {
    return "";
  }

  const detectedLanguage =
    resolution.detection?.language && resolution.detection.language !== "und"
      ? resolveLanguageLabel(resolution.detection.language)
      : "未知语言";
  const systemLanguage = resolveLanguageLabel(resolution.systemLanguage);
  const resolvedTarget = resolveLanguageLabel(resolution.resolvedTargetLanguage);

  switch (resolution.reason) {
    case "source-equals-system":
      if (resolution.systemLanguage === resolution.resolvedTargetLanguage) {
        return `检测到${detectedLanguage}，与系统语言一致；按自动目标规则，仍翻译为${resolvedTarget}。`;
      }

      return `检测到${detectedLanguage}，与系统语言一致，已自动翻译为${resolvedTarget}。`;
    case "source-differs-from-system":
      return `检测到${detectedLanguage}，已自动翻译为${systemLanguage}。`;
    case "short-text-fallback":
      return `文本较短，语言检测不稳定，已回退翻译为${systemLanguage}。`;
    case "low-confidence-fallback":
      return `语言检测置信度较低，已回退翻译为${systemLanguage}。`;
    case "mixed-language-fallback":
      return `文本包含多语言混合内容，已回退翻译为${systemLanguage}。`;
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

  return `自动 -> ${resolveLanguageLabel(resolution.resolvedTargetLanguage)}`;
}
