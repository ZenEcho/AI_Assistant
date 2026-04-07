export type SupportedLanguageCode =
  | "zh"
  | "en"
  | "ja"
  | "ko"
  | "fr"
  | "de"
  | "es"
  | "pt"
  | "ru"
  | "ar";

export type ResolvedSourceLanguageCode = SupportedLanguageCode | "und";

export interface TranslationPreferences {
  sourceLanguage: string;
  targetLanguage: string;
}

export interface LanguageDetectionResult {
  language: ResolvedSourceLanguageCode;
  confidence: number;
  reliable: boolean;
  isMixed: boolean;
  strategy: "manual" | "heuristic" | "model" | "fallback";
}

export type AutoTargetDecisionReason =
  | "manual-target"
  | "system-language-target";

export interface TranslationLanguageResolution {
  requestedSourceLanguage: string;
  requestedTargetLanguage: string;
  resolvedSourceLanguage: string;
  resolvedTargetLanguage: string;
  systemLanguage: string;
  systemLocale: string;
  sourceLanguageCode: ResolvedSourceLanguageCode;
  targetLanguageCode: SupportedLanguageCode;
  usedAutoTarget: boolean;
  reason: AutoTargetDecisionReason;
  detection: LanguageDetectionResult | null;
}
