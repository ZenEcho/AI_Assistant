import { describe, expect, it } from "vitest";
import { formatTranslationResolutionSummary } from "@/services/ai/translationResolutionFormatter";
import type { TranslationLanguageResolution } from "@/types/language";

function createResolution(
  overrides?: Partial<TranslationLanguageResolution>,
): TranslationLanguageResolution {
  return {
    requestedSourceLanguage: "auto",
    requestedTargetLanguage: "auto",
    resolvedSourceLanguage: "English",
    resolvedTargetLanguage: "Chinese (Simplified)",
    systemLanguage: "Chinese (Simplified)",
    systemLocale: "zh-CN",
    sourceLanguageCode: "en",
    targetLanguageCode: "zh",
    usedAutoTarget: true,
    reason: "source-differs-from-system",
    detection: {
      language: "en",
      confidence: 0.96,
      reliable: true,
      isMixed: false,
      strategy: "model",
    },
    ...overrides,
  };
}

describe("formatTranslationResolutionSummary", () => {
  it("describes the source differs from system case", () => {
    expect(formatTranslationResolutionSummary(createResolution())).toBe(
      "检测到English，已自动翻译为简体中文。",
    );
  });

  it("describes the source equals system case", () => {
    expect(
      formatTranslationResolutionSummary(
        createResolution({
          resolvedSourceLanguage: "Chinese (Simplified)",
          resolvedTargetLanguage: "English",
          sourceLanguageCode: "zh",
          targetLanguageCode: "en",
          reason: "source-equals-system",
          detection: {
            language: "zh",
            confidence: 0.99,
            reliable: true,
            isMixed: false,
            strategy: "model",
          },
        }),
      ),
    ).toBe("检测到简体中文，与系统语言一致，已自动翻译为English。");
  });

  it("clarifies the English-system fallback when auto target still resolves to English", () => {
    expect(
      formatTranslationResolutionSummary(
        createResolution({
          resolvedSourceLanguage: "English",
          resolvedTargetLanguage: "English",
          systemLanguage: "English",
          systemLocale: "en-US",
          sourceLanguageCode: "en",
          targetLanguageCode: "en",
          reason: "source-equals-system",
          detection: {
            language: "en",
            confidence: 0.99,
            reliable: true,
            isMixed: false,
            strategy: "model",
          },
        }),
      ),
    ).toBe("检测到English，与系统语言一致；按自动目标规则，仍翻译为English。");
  });

  it("returns an empty string for manual targets", () => {
    expect(
      formatTranslationResolutionSummary(
        createResolution({
          usedAutoTarget: false,
          reason: "manual-target",
        }),
      ),
    ).toBe("");
  });
});
