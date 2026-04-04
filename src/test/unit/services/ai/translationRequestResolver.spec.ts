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

  it("falls back to English when detected source matches the system language", async () => {
    mocked.getSystemLocale.mockResolvedValue("zh-CN");
    mocked.detectSourceLanguage.mockResolvedValue({
      language: "zh",
      confidence: 0.99,
      reliable: true,
      isMixed: false,
      strategy: "model",
    });

    const { resolveTranslationRequest } = await import("@/services/ai/translationRequestResolver");
    const { resolvedRequest, resolution } = await resolveTranslationRequest(
      createModelConfig(),
      createRequest({
        sourceText: "你好世界",
      }),
    );

    expect(resolvedRequest.targetLanguage).toBe("English");
    expect(resolution.usedAutoTarget).toBe(true);
    expect(resolution.reason).toBe("source-equals-system");
  });

  it("falls back to English when the system language itself is English", async () => {
    mocked.getSystemLocale.mockResolvedValue("en-US");
    mocked.detectSourceLanguage.mockResolvedValue({
      language: "en",
      confidence: 0.99,
      reliable: true,
      isMixed: false,
      strategy: "model",
    });

    const { resolveTranslationRequest } = await import("@/services/ai/translationRequestResolver");
    const { resolvedRequest, resolution } = await resolveTranslationRequest(
      createModelConfig(),
      createRequest({
        sourceText: "hello world",
      }),
    );

    expect(resolvedRequest.targetLanguage).toBe("English");
    expect(resolution.systemLanguage).toBe("English");
    expect(resolution.reason).toBe("source-equals-system");
  });

  it("uses the system language when detected source differs from it", async () => {
    mocked.getSystemLocale.mockResolvedValue("zh-CN");
    mocked.detectSourceLanguage.mockResolvedValue({
      language: "en",
      confidence: 0.97,
      reliable: true,
      isMixed: false,
      strategy: "model",
    });

    const { resolveTranslationRequest } = await import("@/services/ai/translationRequestResolver");
    const { resolvedRequest, resolution } = await resolveTranslationRequest(
      createModelConfig(),
      createRequest({
        sourceText: "hello world",
      }),
    );

    expect(resolvedRequest.targetLanguage).toBe("Chinese (Simplified)");
    expect(resolution.reason).toBe("source-differs-from-system");
  });

  it("maps zh-TW system locale to a traditional Chinese provider target", async () => {
    mocked.getSystemLocale.mockResolvedValue("zh-TW");
    mocked.detectSourceLanguage.mockResolvedValue({
      language: "en",
      confidence: 0.96,
      reliable: true,
      isMixed: false,
      strategy: "model",
    });

    const { resolveTranslationRequest } = await import("@/services/ai/translationRequestResolver");
    const { resolvedRequest, resolution } = await resolveTranslationRequest(
      createModelConfig(),
      createRequest({
        sourceText: "hello world",
      }),
    );

    expect(resolvedRequest.targetLanguage).toBe("Chinese (Traditional)");
    expect(resolution.systemLanguage).toBe("Chinese (Traditional)");
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
  });

  it("uses a manually selected source language to decide the auto target without detection", async () => {
    mocked.getSystemLocale.mockResolvedValue("zh-CN");

    const { resolveTranslationRequest } = await import("@/services/ai/translationRequestResolver");
    const { resolvedRequest, resolution } = await resolveTranslationRequest(
      createModelConfig(),
      createRequest({
        sourceLanguage: "Chinese (Simplified)",
        sourceText: "这是一次中文测试",
      }),
    );

    expect(mocked.detectSourceLanguage).not.toHaveBeenCalled();
    expect(resolvedRequest.targetLanguage).toBe("English");
    expect(resolution.reason).toBe("source-equals-system");
  });

  it("preserves the manually selected source language label in auto target mode", async () => {
    mocked.getSystemLocale.mockResolvedValue("zh-CN");

    const { resolveTranslationRequest } = await import("@/services/ai/translationRequestResolver");
    const { resolvedRequest, resolution } = await resolveTranslationRequest(
      createModelConfig(),
      createRequest({
        sourceLanguage: "Chinese (Traditional)",
        sourceText: "這是一段繁體中文測試",
      }),
    );

    expect(resolvedRequest.sourceLanguage).toBe("Chinese (Traditional)");
    expect(resolvedRequest.targetLanguage).toBe("English");
    expect(resolution.resolvedSourceLanguage).toBe("Chinese (Traditional)");
  });

  it("falls back to the system language when detection is not reliable", async () => {
    mocked.getSystemLocale.mockResolvedValue("en-US");
    mocked.detectSourceLanguage.mockResolvedValue({
      language: "und",
      confidence: 0.28,
      reliable: false,
      isMixed: false,
      strategy: "fallback",
    });

    const { resolveTranslationRequest } = await import("@/services/ai/translationRequestResolver");
    const { resolvedRequest, resolution } = await resolveTranslationRequest(
      createModelConfig(),
      createRequest({
        sourceText: "ok",
      }),
    );

    expect(resolvedRequest.sourceLanguage).toBe("auto");
    expect(resolvedRequest.targetLanguage).toBe("English");
    expect(resolution.reason).toBe("short-text-fallback");
  });

  it("falls back to the system language when the text is mixed", async () => {
    mocked.getSystemLocale.mockResolvedValue("ja-JP");
    mocked.detectSourceLanguage.mockResolvedValue({
      language: "und",
      confidence: 0.42,
      reliable: false,
      isMixed: true,
      strategy: "model",
    });

    const { resolveTranslationRequest } = await import("@/services/ai/translationRequestResolver");
    const { resolvedRequest, resolution } = await resolveTranslationRequest(
      createModelConfig(),
      createRequest({
        sourceText: "hello 你好 world",
      }),
    );

    expect(resolvedRequest.targetLanguage).toBe("Japanese");
    expect(resolution.reason).toBe("mixed-language-fallback");
  });
});
