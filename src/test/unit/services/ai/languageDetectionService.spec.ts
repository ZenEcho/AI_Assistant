import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TranslateRequest } from "@/types/ai";
import type { ModelConfig } from "@/types/app";

const mocked = vi.hoisted(() => ({
  createAIProvider: vi.fn(),
  completeChat: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@/services/ai/providerFactory", () => ({
  createAIProvider: mocked.createAIProvider,
}));

vi.mock("@/services/logging/logger", () => ({
  createLogger: () => ({
    warn: mocked.warn,
  }),
}));

import {
  detectSourceLanguage,
  formatDetectedLanguage,
} from "@/services/ai/languageDetectionService";

function createModelConfig(): ModelConfig {
  return {
    id: "model-1",
    name: "Detector",
    provider: "openai-compatible",
    baseUrl: "https://example.com/v1",
    apiKey: "test-key",
    model: "gpt-4o-mini",
    enabled: true,
    isDefault: true,
    systemPrompt: "translate",
    timeoutMs: 60_000,
    createdAt: "2026-04-04T00:00:00.000Z",
    updatedAt: "2026-04-04T00:00:00.000Z",
  };
}

function createRequest(overrides?: Partial<TranslateRequest>): TranslateRequest {
  return {
    sourceText: "hello world",
    sourceLanguage: "auto",
    targetLanguage: "English",
    sourceImage: null,
    ...overrides,
  };
}

describe("languageDetectionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.createAIProvider.mockReturnValue({
      completeChat: mocked.completeChat,
    });
  });

  it("returns a manual detection result when the source language is explicitly selected", async () => {
    const result = await detectSourceLanguage(
      createModelConfig(),
      createRequest({
        sourceLanguage: "Japanese",
        sourceText: "これはテストです",
      }),
    );

    expect(result).toEqual({
      language: "ja",
      confidence: 1,
      reliable: true,
      isMixed: false,
      strategy: "manual",
    });
    expect(mocked.createAIProvider).not.toHaveBeenCalled();
  });

  it("uses heuristic detection for reliable non-latin text without calling the model", async () => {
    const result = await detectSourceLanguage(
      createModelConfig(),
      createRequest({
        sourceText: "你好世界，这是一次中文检测。",
      }),
    );

    expect(result.language).toBe("zh");
    expect(result.strategy).toBe("heuristic");
    expect(result.reliable).toBe(true);
    expect(mocked.createAIProvider).not.toHaveBeenCalled();
  });

  it("falls back to the model for ambiguous latin text and parses fenced JSON responses", async () => {
    mocked.completeChat.mockResolvedValue({
      content: "```json\n{\"language\":\"ja\",\"confidence\":1.4,\"reliable\":true,\"isMixed\":false}\n```",
      raw: null,
    });

    const result = await detectSourceLanguage(
      createModelConfig(),
      createRequest({
        sourceText: "hello",
      }),
    );

    expect(mocked.completeChat).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
          }),
          expect.objectContaining({
            role: "user",
          }),
        ]),
      }),
    );
    expect(result).toEqual({
      language: "ja",
      confidence: 1,
      reliable: true,
      isMixed: false,
      strategy: "model",
    });
  });

  it("logs a warning and falls back to heuristic detection when the model call fails", async () => {
    mocked.completeChat.mockRejectedValue(new Error("network failed"));

    const result = await detectSourceLanguage(
      createModelConfig(),
      createRequest({
        sourceText: "hello world",
      }),
    );

    expect(result.language).toBe("en");
    expect(result.strategy).toBe("heuristic");
    expect(result.reliable).toBe(false);
    expect(mocked.warn).toHaveBeenCalledWith(
      "translation.language-detect.failed",
      "语言检测失败，已回退启发式策略",
      expect.objectContaining({
        detail: {
          modelId: "model-1",
        },
      }),
    );
  });

  it("formats detected languages for display", () => {
    expect(formatDetectedLanguage(null)).toBe("未知");
    expect(
      formatDetectedLanguage({
        language: "zh",
        confidence: 0.98,
        reliable: true,
        isMixed: false,
        strategy: "heuristic",
      }),
    ).toBe("简体中文");
  });
});
