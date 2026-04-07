import {
  isAutoLanguageValue,
  normalizeLanguageCode,
  normalizeLocaleToLanguageCode,
  resolveProviderLanguageValue,
  resolveSystemLanguageTargetValue,
} from "@/constants/languages";
import { getSystemLocale } from "@/services/app/systemLanguageService";
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

function resolveResolvedSourceLanguage(
  request: TranslateRequest,
  systemLocale: string,
) {
  const manualSourceLanguageCode = normalizeLanguageCode(request.sourceLanguage);

  if (!manualSourceLanguageCode || request.sourceLanguage === "auto") {
    return {
      resolvedSourceLanguage: "auto",
      sourceLanguageCode: "und" as const,
    };
  }

  return {
    resolvedSourceLanguage: request.sourceLanguage.trim() || resolveProviderLanguageValue(
      manualSourceLanguageCode,
      {
        localeTag: systemLocale,
      },
    ),
    sourceLanguageCode: manualSourceLanguageCode,
  };
}

export async function resolveTranslationRequest(
  _modelConfig: ModelConfig,
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

  const { resolvedSourceLanguage, sourceLanguageCode } = resolveResolvedSourceLanguage(
    request,
    systemLocale,
  );

  const resolution: TranslationLanguageResolution = {
    requestedSourceLanguage: request.sourceLanguage,
    requestedTargetLanguage: request.targetLanguage,
    resolvedSourceLanguage,
    resolvedTargetLanguage: systemLanguage,
    systemLanguage,
    systemLocale,
    sourceLanguageCode,
    targetLanguageCode: systemLanguageCode,
    usedAutoTarget: true,
    reason: "system-language-target",
    detection: null,
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
