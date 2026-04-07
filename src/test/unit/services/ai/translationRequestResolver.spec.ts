import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TranslateRequest } from "@/types/ai";
import type { ModelConfig } from "@/types/app";

const mocked = vi.hoisted(() => ({
  getSystemLocale: vi.fn(),
  detectSourceLanguage: vi.fn(),
}));

vi.mock("@/services/app/systemLanguageService", () => ({
  getSystemLocale: mocked.getSystemLocale,
}));

vi.mock("@/services/ai/languageDetectionService", () => ({
  detectSourceLanguage: mocked.detectSourceLanguage,
}));

function createModelConfig(): ModelConfig {
  return {
    id: "model-1",
    name: "Model 1",
    provider: "openai-compatible",
    baseUrl: "https://example.com/v1",
    apiKey: "test-key",
    model: "gpt-4o-mini",
    enabled: true,
    isDefault: true,
    systemPrompt: "translate",
    timeoutMs: 60_000,
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:00:00.000Z",
  };
}

function createRequest(overrides?: Partial<TranslateRequest>): TranslateRequest {
  return {
    sourceText: "hello",
    sourceLanguage: "auto",
    targetLanguage: "auto",
    sourceImage: null,
    ...overrides,
  };
}

describe("resolveTranslationRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves auto target from the system locale without invoking language detection", async () => {
    mocked.getSystemLocale.mockResolvedValue("zh-CN");

    const { resolveTranslationRequest } = await import("@/services/ai/translationRequestResolver");
    const { resolvedRequest, resolution } = await resolveTranslationRequest(
      createModelConfig(),
      createRequest({
        sourceText: "hello world",
      }),
    );

    expect(mocked.detectSourceLanguage).not.toHaveBeenCalled();
    expect(resolvedRequest.sourceLanguage).toBe("auto");
    expect(resolvedRequest.targetLanguage).toBe("Chinese (Simplified)");
    expect(resolution.usedAutoTarget).toBe(true);
    expect(resolution.systemLanguage).toBe("Chinese (Simplified)");
    expect(resolution.reason).toBe("system-language-target");
    expect(resolution.detection).toBeNull();
  });

  it("keeps English as the auto target when the system language is English", async () => {
    mocked.getSystemLocale.mockResolvedValue("en-US");

    const { resolveTranslationRequest } = await import("@/services/ai/translationRequestResolver");
    const { resolvedRequest, resolution } = await resolveTranslationRequest(
      createModelConfig(),
      createRequest({
        sourceText: "hello world",
      }),
    );

    expect(resolvedRequest.targetLanguage).toBe("English");
    expect(resolution.systemLanguage).toBe("English");
    expect(resolution.reason).toBe("system-language-target");
  });

  it("maps zh-TW system locale to a traditional Chinese provider target", async () => {
    mocked.getSystemLocale.mockResolvedValue("zh-TW");

    const { resolveTranslationRequest } = await import("@/services/ai/translationRequestResolver");
    const { resolvedRequest, resolution } = await resolveTranslationRequest(
      createModelConfig(),
      createRequest({
        sourceText: "hello world",
      }),
    );

    expect(resolvedRequest.targetLanguage).toBe("Chinese (Traditional)");
    expect(resolution.systemLanguage).toBe("Chinese (Traditional)");
    expect(resolution.targetLanguageCode).toBe("zh");
  });

  it("keeps manual targets untouched", async () => {
    mocked.getSystemLocale.mockResolvedValue("ja-JP");

    const { resolveTranslationRequest } = await import("@/services/ai/translationRequestResolver");
    const { resolvedRequest, resolution } = await resolveTranslationRequest(
      createModelConfig(),
      createRequest({
        sourceLanguage: "Japanese",
        targetLanguage: "Chinese (Traditional)",
      }),
    );

    expect(mocked.detectSourceLanguage).not.toHaveBeenCalled();
    expect(resolvedRequest.targetLanguage).toBe("Chinese (Traditional)");
    expect(resolution.usedAutoTarget).toBe(false);
    expect(resolution.reason).toBe("manual-target");
  });

  it("preserves the manually selected source language label in auto target mode", async () => {
    mocked.getSystemLocale.mockResolvedValue("zh-CN");

    const { resolveTranslationRequest } = await import("@/services/ai/translationRequestResolver");
    const { resolvedRequest, resolution } = await resolveTranslationRequest(
      createModelConfig(),
      createRequest({
        sourceLanguage: "Chinese (Traditional)",
        sourceText: "traditional chinese text",
      }),
    );

    expect(mocked.detectSourceLanguage).not.toHaveBeenCalled();
    expect(resolvedRequest.sourceLanguage).toBe("Chinese (Traditional)");
    expect(resolvedRequest.targetLanguage).toBe("Chinese (Simplified)");
    expect(resolution.resolvedSourceLanguage).toBe("Chinese (Traditional)");
    expect(resolution.sourceLanguageCode).toBe("zh");
  });
});
