import {
  isAutoLanguageValue,
  normalizeLanguageCode,
  normalizeLocaleToLanguageCode,
  resolveProviderLanguageValue,
  resolveSystemLanguageTargetValue,
} from "@/constants/languages";
import { getSystemLocale } from "@/services/app/systemLanguageService";
import { detectSourceLanguage } from "@/services/ai/languageDetectionService";
import type { TranslateRequest } from "@/types/ai";
import type { ModelConfig } from "@/types/app";
import type { TranslationLanguageResolution } from "@/types/language";

function createManualResolution(
  request: TranslateRequest,
  systemLocale: string,
): TranslationLanguageResolution {
  const targetLanguageCode = normalizeLanguageCode(request.targetLanguage) ?? "en";
  const resolvedSourceCode = normalizeLanguageCode(request.sourceLanguage);
  const resolvedSourceLanguage = request.sourceLanguage === "auto"
    ? "auto"
    : request.sourceLanguage.trim();
  const resolvedTargetLanguage = request.targetLanguage.trim() || resolveProviderLanguageValue(
    targetLanguageCode,
    {
      localeTag: systemLocale,
    },
  );

  return {
    requestedSourceLanguage: request.sourceLanguage,
    requestedTargetLanguage: request.targetLanguage,
    resolvedSourceLanguage,
    resolvedTargetLanguage,
    systemLanguage: resolveSystemLanguageTargetValue(systemLocale),
    systemLocale,
    sourceLanguageCode: resolvedSourceCode ?? "und",
    targetLanguageCode,
    usedAutoTarget: false,
    reason: "manual-target",
    detection: null,
  };
}

function resolveAutoSourceLanguageValue(
  request: TranslateRequest,
  resolvedSourceCode: TranslationLanguageResolution["sourceLanguageCode"],
  systemLocale: string,
) {
  if (resolvedSourceCode === "und") {
    return "auto";
  }

  const requestedSourceLanguage = request.sourceLanguage.trim();
  const manualSourceLanguageCode = normalizeLanguageCode(request.sourceLanguage);

  if (manualSourceLanguageCode && requestedSourceLanguage) {
    return requestedSourceLanguage;
  }

  return resolveProviderLanguageValue(resolvedSourceCode, {
    localeTag: systemLocale,
  });
}

export async function resolveTranslationRequest(
  modelConfig: ModelConfig,
  request: TranslateRequest,
) {
  const systemLocale = await getSystemLocale();
  const systemLanguageCode = normalizeLocaleToLanguageCode(systemLocale) ?? "en";
  const systemLanguage = resolveSystemLanguageTargetValue(systemLocale);

  if (!isAutoLanguageValue(request.targetLanguage)) {
    const resolution = createManualResolution(request, systemLocale);

    return {
      resolvedRequest: {
        ...request,
        sourceLanguage: resolution.resolvedSourceLanguage,
        targetLanguage: resolution.resolvedTargetLanguage,
        resolution,
      },
      resolution,
    };
  }

  const manualSourceLanguageCode = normalizeLanguageCode(request.sourceLanguage);
  const detection = manualSourceLanguageCode
    ? {
        language: manualSourceLanguageCode,
        confidence: 1,
        reliable: true,
        isMixed: false,
        strategy: "manual" as const,
      }
    : await detectSourceLanguage(modelConfig, request);
  const resolvedSourceCode = detection.reliable ? detection.language : "und";
  const targetLanguageCode =
    detection.reliable && detection.language === systemLanguageCode
      ? "en"
      : systemLanguageCode;
  const reason = !detection.reliable
    ? detection.isMixed
      ? "mixed-language-fallback"
      : request.sourceText.trim().length <= 4
        ? "short-text-fallback"
        : "low-confidence-fallback"
    : detection.language === systemLanguageCode
      ? "source-equals-system"
      : "source-differs-from-system";

  const resolution: TranslationLanguageResolution = {
    requestedSourceLanguage: request.sourceLanguage,
    requestedTargetLanguage: request.targetLanguage,
    resolvedSourceLanguage: resolveAutoSourceLanguageValue(
      request,
      resolvedSourceCode,
      systemLocale,
    ),
    resolvedTargetLanguage: resolveProviderLanguageValue(targetLanguageCode, {
      localeTag: systemLocale,
    }),
    systemLanguage,
    systemLocale,
    sourceLanguageCode: resolvedSourceCode,
    targetLanguageCode,
    usedAutoTarget: true,
    reason,
    detection,
  };

  return {
    resolvedRequest: {
      ...request,
      sourceLanguage: resolution.resolvedSourceLanguage,
      targetLanguage: resolution.resolvedTargetLanguage,
      resolution,
    },
    resolution,
  };
}
