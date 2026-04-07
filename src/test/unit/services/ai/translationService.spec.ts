import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TranslateRequest } from "@/types/ai";
import type { ModelConfig } from "@/types/app";

const mocked = vi.hoisted(() => ({
  appConfigStore: {
    preferences: {
      logging: {
        detailedRequestLogging: true,
      },
    },
  },
  createAIProvider: vi.fn(),
  completeChat: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/stores/appConfig", () => ({
  useAppConfigStore: () => mocked.appConfigStore,
}));

vi.mock("@/services/ai/providerFactory", () => ({
  createAIProvider: mocked.createAIProvider,
}));

vi.mock("@/services/logging/logger", () => ({
  createLogger: () => ({
    info: mocked.info,
  }),
}));

import { translateText } from "@/services/ai/translationService";

function createModelConfig(): ModelConfig {
  return {
    id: "model-1",
    name: "Translator",
    provider: "openai-compatible",
    baseUrl: "https://example.com/v1",
    apiKey: "test-key",
    model: "gpt-4o-mini",
    enabled: true,
    isDefault: true,
    systemPrompt: "Translate the text accurately.",
    timeoutMs: 60_000,
    createdAt: "2026-04-04T00:00:00.000Z",
    updatedAt: "2026-04-04T00:00:00.000Z",
  };
}

function createRequest(overrides?: Partial<TranslateRequest>): TranslateRequest {
  return {
    sourceText: "Hello world",
    sourceLanguage: "auto",
    targetLanguage: "English",
    sourceImage: null,
    ...overrides,
  };
}

describe("translationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.appConfigStore.preferences.logging.detailedRequestLogging = true;
    mocked.createAIProvider.mockReturnValue({
      completeChat: mocked.completeChat,
    });
  });

  it("builds a plain-text chat request and forwards stream metadata to the provider", async () => {
    mocked.completeChat.mockResolvedValue({
      content: "Hello translated",
      model: "custom-model",
      usage: {
        totalTokens: 42,
      },
      raw: {
        id: "raw-1",
      },
    });

    const handlers = {
      onTextDelta: vi.fn(),
    };

    const result = await translateText(
      createModelConfig(),
      createRequest(),
      handlers,
      {
        requestId: "req-1",
        traceId: "trace-1",
        detailedLogging: true,
      },
    );

    expect(mocked.info).toHaveBeenCalledWith(
      "translation.service.dispatch",
      expect.any(String),
      expect.objectContaining({
        requestId: "req-1",
        traceId: "trace-1",
        detail: expect.objectContaining({
          modelId: "model-1",
          stream: true,
          detailedLogging: true,
        }),
      }),
    );
    expect(mocked.completeChat).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        messages: [
          {
            role: "system",
            content: "Translate the text accurately.",
          },
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining("Translate the following content into English."),
          }),
        ],
        requestId: "req-1",
        traceId: "trace-1",
        detailedLogging: true,
      }),
      handlers,
    );
    expect(result).toEqual({
      text: "Hello translated",
      model: "custom-model",
      provider: "openai-compatible",
      usage: {
        totalTokens: 42,
      },
      raw: {
        id: "raw-1",
      },
    });
  });

  it("treats image-attached requests as plain OCR text input and never builds multimodal content", async () => {
    mocked.appConfigStore.preferences.logging.detailedRequestLogging = false;
    mocked.completeChat.mockResolvedValue({
      content: "Image translated",
      model: null,
      raw: null,
    });

    const request = createRequest({
      sourceText: "Line one\nLine two",
      sourceImage: {
        dataUrl: "data:image/png;base64,abc123",
        mimeType: "image/png",
        name: "capture.png",
      },
    });

    const result = await translateText(createModelConfig(), request);
    const [, providerRequest] = mocked.completeChat.mock.calls[0];
    const userMessage = providerRequest.messages[1];

    expect(typeof userMessage.content).toBe("string");
    expect(userMessage.content).toContain("Translate the following content into English.");
    expect(userMessage.content).toContain("Text:");
    expect(userMessage.content).toContain("Line one\nLine two");
    expect(userMessage.content).not.toContain("Read all visible text in the image with OCR.");
    expect(providerRequest.detailedLogging).toBe(false);
    expect(result.model).toBe("gpt-4o-mini");
  });

  it("adds single-request auto-target routing instructions when the target comes from the system language", async () => {
    mocked.completeChat.mockResolvedValue({
      content: "Hello translated",
      model: "custom-model",
      raw: null,
    });

    await translateText(
      createModelConfig(),
      createRequest({
        targetLanguage: "Chinese (Simplified)",
        resolution: {
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
        },
      }),
    );

    const [, providerRequest] = mocked.completeChat.mock.calls[0];
    const userMessage = providerRequest.messages[1];

    expect(typeof userMessage.content).toBe("string");
    expect(userMessage.content).toContain(
      "If the source content is already in Chinese (Simplified), translate it into English.",
    );
    expect(userMessage.content).toContain(
      "Otherwise, translate the content into Chinese (Simplified).",
    );
  });
});
