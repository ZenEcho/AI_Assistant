import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSystemInputTranslationSession } from "@/services/systemInput/sessionOrchestrator";
import type { TranslateRequest, TranslateResult } from "@/types/ai";
import type { ModelConfig } from "@/types/app";
import type { SystemInputTranslationRequestEvent, SystemInputWritebackResult } from "@/types/systemInput";

const mocked = vi.hoisted(() => ({
  submitSystemInputTranslation: vi.fn(),
  presentTranslationResultInResultWindow: vi.fn(),
}));

vi.mock("@/services/systemInput/nativeBridge", () => ({
  submitSystemInputTranslation: mocked.submitSystemInputTranslation,
}));

vi.mock("@/services/window/windowManager", () => ({
  presentTranslationResultInResultWindow: mocked.presentTranslationResultInResultWindow,
}));

function createModel(id: string, name = id): ModelConfig {
  return {
    id,
    name,
    provider: "openai-compatible",
    baseUrl: "https://example.com/v1",
    apiKey: "test-key",
    model: `${id}-model`,
    enabled: true,
    isDefault: false,
    systemPrompt: "translate",
    timeoutMs: 60_000,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function createEvent(overrides?: Partial<SystemInputTranslationRequestEvent>): SystemInputTranslationRequestEvent {
  return {
    sessionId: "session-1",
    triggerMode: "double-alt",
    sourceLanguage: "",
    targetLanguage: "",
    targetApp: {
      processId: 1234,
      processName: "notepad.exe",
      windowHandle: "0x1234",
      windowTitle: "记事本",
    },
    capturedText: {
      selectedText: null,
      beforeCaretText: "hello world",
      wholeInputText: null,
      preferredText: "hello world",
      preferredStrategy: "before-caret-first",
    },
    emittedAt: "1710000000000",
    ...overrides,
  };
}

function createWritebackResult(overrides?: Partial<SystemInputWritebackResult>): SystemInputWritebackResult {
  return {
    sessionId: "session-1",
    success: true,
    usedStrategy: "native-replace",
    fallbackWindowRequired: false,
    error: null,
    ...overrides,
  };
}

function createTranslateResult(text = "你好，世界"): TranslateResult {
  return {
    text,
    model: "provider-model",
    provider: "openai-compatible",
    raw: null,
  };
}

describe("runSystemInputTranslationSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers the selected translation model over the default model", async () => {
    const selectedModel = createModel("selected", "Selected Model");
    const defaultModel = createModel("default", "Default Model");
    const result = createTranslateResult();
    const translateDetached = vi.fn(async (_request: TranslateRequest, modelConfig?: ModelConfig | null) => {
      expect(modelConfig).toEqual(selectedModel);
      return result;
    });

    mocked.submitSystemInputTranslation.mockResolvedValue(createWritebackResult());

    await runSystemInputTranslationSession(createEvent(), {
      appConfigStore: {
        preferences: {
          locale: "zh-CN",
          systemInput: {
            sourceLanguage: "auto",
            targetLanguage: "English",
            showFloatingHint: false,
          },
        },
        selectedTranslationModel: selectedModel,
        defaultModel,
      },
      translationStore: {
        resolveRequest: vi.fn(async (request: TranslateRequest) => request),
        translateDetached,
        presentResult: vi.fn(),
      },
    });

    expect(translateDetached).toHaveBeenCalledTimes(1);
    expect(mocked.submitSystemInputTranslation).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        translatedText: result.text,
        sourceText: "hello world",
        captureStrategy: "before-caret-first",
        targetApp: expect.objectContaining({
          processName: "notepad.exe",
        }),
        request: expect.objectContaining({
          sourceText: "hello world",
          sourceLanguage: "auto",
          targetLanguage: "English",
        }),
      }),
    );
  });

  it("falls back to the default model when the selected model translation fails", async () => {
    const selectedModel = createModel("selected", "Selected Model");
    const defaultModel = createModel("default", "Default Model");
    const result = createTranslateResult("fallback-result");
    const translateDetached = vi
      .fn<(_request: TranslateRequest, modelConfig?: ModelConfig | null) => Promise<TranslateResult>>()
      .mockRejectedValueOnce(new Error("Upstream service temporarily unavailable (502 Bad Gateway)"))
      .mockResolvedValueOnce(result);

    mocked.submitSystemInputTranslation.mockResolvedValue(createWritebackResult());

    await runSystemInputTranslationSession(createEvent(), {
      appConfigStore: {
        preferences: {
          locale: "zh-CN",
          systemInput: {
            sourceLanguage: "auto",
            targetLanguage: "English",
            showFloatingHint: false,
          },
        },
        selectedTranslationModel: selectedModel,
        defaultModel,
      },
      translationStore: {
        resolveRequest: vi.fn(async (request: TranslateRequest) => request),
        translateDetached,
        presentResult: vi.fn(),
      },
    });

    expect(translateDetached).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sourceText: "hello world",
        targetLanguage: "English",
      }),
      selectedModel,
    );
    expect(translateDetached).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sourceText: "hello world",
        targetLanguage: "English",
      }),
      defaultModel,
    );
  });

  it("derives target language from locale when no target language is provided", async () => {
    const selectedModel = createModel("selected", "Selected Model");
    const translateDetached = vi.fn(async (request: TranslateRequest) => {
      expect(request.targetLanguage).toBe("English");
      return createTranslateResult("hello");
    });

    mocked.submitSystemInputTranslation.mockResolvedValue(createWritebackResult());

    await runSystemInputTranslationSession(
      createEvent({
        sourceLanguage: "",
        targetLanguage: "",
      }),
      {
        appConfigStore: {
          preferences: {
            locale: "en-US",
            systemInput: {
              sourceLanguage: "auto",
              targetLanguage: "",
              showFloatingHint: false,
            },
          },
          selectedTranslationModel: selectedModel,
          defaultModel: null,
        },
        translationStore: {
          resolveRequest: vi.fn(async (request: TranslateRequest) => request),
          translateDetached,
          presentResult: vi.fn(),
        },
      },
    );

    expect(translateDetached).toHaveBeenCalledTimes(1);
  });

  it("shows the result window when writeback falls back to popup", async () => {
    const selectedModel = createModel("selected", "Selected Model");
    const result = createTranslateResult("translated");
    const translateDetached = vi.fn(async () => result);

    mocked.submitSystemInputTranslation.mockResolvedValue(
      createWritebackResult({
        success: false,
        usedStrategy: "popup-only",
        fallbackWindowRequired: true,
        error: "writeback failed",
      }),
    );

    await runSystemInputTranslationSession(createEvent(), {
      appConfigStore: {
        preferences: {
          locale: "zh-CN",
          systemInput: {
            sourceLanguage: "auto",
            targetLanguage: "English",
            showFloatingHint: false,
          },
        },
        selectedTranslationModel: selectedModel,
        defaultModel: null,
      },
      translationStore: {
        resolveRequest: vi.fn(async (request: TranslateRequest) => request),
        translateDetached,
        presentResult: vi.fn(),
      },
    });

    expect(mocked.presentTranslationResultInResultWindow).toHaveBeenCalledWith({
      modelName: "Selected Model",
      request: expect.objectContaining({
        sourceText: "hello world",
        targetLanguage: "English",
      }),
      result,
    });
  });

  it("shows the result window as a hint when floating hints are enabled", async () => {
    const selectedModel = createModel("selected", "Selected Model");
    const result = createTranslateResult("translated");
    const translateDetached = vi.fn(async () => result);

    mocked.submitSystemInputTranslation.mockResolvedValue(createWritebackResult());

    await runSystemInputTranslationSession(createEvent(), {
      appConfigStore: {
        preferences: {
          locale: "zh-CN",
          systemInput: {
            sourceLanguage: "auto",
            targetLanguage: "English",
            showFloatingHint: true,
          },
        },
        selectedTranslationModel: selectedModel,
        defaultModel: null,
      },
      translationStore: {
        resolveRequest: vi.fn(async (request: TranslateRequest) => request),
        translateDetached,
        presentResult: vi.fn(),
      },
    });

    expect(mocked.presentTranslationResultInResultWindow).toHaveBeenCalledWith({
      modelName: "Selected Model",
      request: expect.objectContaining({
        sourceText: "hello world",
      }),
      result,
    });
  });
});
