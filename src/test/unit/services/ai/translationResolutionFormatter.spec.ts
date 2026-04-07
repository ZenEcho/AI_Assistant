import { describe, expect, it } from "vitest";
import { formatTranslationResolutionSummary } from "@/services/ai/translationResolutionFormatter";
import type { TranslationLanguageResolution } from "@/types/language";

function createResolution(
  overrides?: Partial<TranslationLanguageResolution>,
): TranslationLanguageResolution {
  return {
    requestedSourceLanguage: "auto",
    requestedTargetLanguage: "auto",
    resolvedSourceLanguage: "auto",
    resolvedTargetLanguage: "Chinese (Simplified)",
    systemLanguage: "Chinese (Simplified)",
    systemLocale: "zh-CN",
    sourceLanguageCode: "und",
    targetLanguageCode: "zh",
    usedAutoTarget: true,
    reason: "system-language-target",
    detection: null,
    ...overrides,
  };
}

describe("formatTranslationResolutionSummary", () => {
  it("describes the single-request system-language auto target flow", () => {
    expect(formatTranslationResolutionSummary(createResolution())).toBe(
      "Auto target resolved to 简体中文 from the current system language; whether to switch to English is decided by the model in the same request.",
    );
  });

  it("uses the resolved target label in the summary", () => {
    expect(
      formatTranslationResolutionSummary(
        createResolution({
          resolvedTargetLanguage: "English",
          systemLanguage: "English",
          systemLocale: "en-US",
          targetLanguageCode: "en",
        }),
      ),
    ).toBe(
      "Auto target resolved to English from the current system language; whether to switch to English is decided by the model in the same request.",
    );
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
