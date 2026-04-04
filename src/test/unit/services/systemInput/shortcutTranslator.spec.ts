import { describe, expect, it, vi } from "vitest";
import {
  buildShortcutRequest,
  buildShortcutRequestKey,
  executeShortcutTranslation,
  resolvePreferredModels,
} from "@/services/systemInput/shortcutTranslator";
import type { TranslateRequest, TranslateResult } from "@/types/ai";
import type { ModelConfig } from "@/types/app";

// shortcutTranslator uses createLogger internally; mock the logger to keep tests
// isolated from the logging infrastructure and Tauri APIs.
vi.mock("@/services/logging/logger", () => ({
  createLogger: () => ({
    warn: vi.fn(async () => undefined),
    info: vi.fn(async () => undefined),
    error: vi.fn(async () => undefined),
  }),
}));

// ─── helpers ─────────────────────────────────────────────────────────────────

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

function createRequest(overrides?: Partial<TranslateRequest>): TranslateRequest {
  return {
    sourceText: "hello world",
    sourceLanguage: "auto",
    targetLanguage: "Chinese (Simplified)",
    sourceImage: null,
    ...overrides,
  };
}

function createTranslateResult(text = "你好世界"): TranslateResult {
  return {
    text,
    model: "gpt-4o-mini",
    provider: "openai-compatible",
    raw: null,
  };
}

// ─── resolvePreferredModels ───────────────────────────────────────────────────

describe("resolvePreferredModels", () => {
  it("uses selectedModel as primaryModel when it is set", () => {
    const selected = createModel("selected");
    const defaultModel = createModel("default");

    const { primaryModel, fallbackModel } = resolvePreferredModels(selected, defaultModel);

    expect(primaryModel).toEqual(selected);
    expect(fallbackModel).toEqual(defaultModel);
  });

  it("falls back to defaultModel as primary when selectedModel is null", () => {
    const defaultModel = createModel("default");

    const { primaryModel, fallbackModel } = resolvePreferredModels(null, defaultModel);

    expect(primaryModel).toEqual(defaultModel);
    expect(fallbackModel).toBeNull();
  });

  it("returns null for both when both inputs are null", () => {
    const { primaryModel, fallbackModel } = resolvePreferredModels(null, null);

    expect(primaryModel).toBeNull();
    expect(fallbackModel).toBeNull();
  });

  it("returns no fallback when selectedModel and defaultModel are the same", () => {
    const model = createModel("model-1");

    const { primaryModel, fallbackModel } = resolvePreferredModels(model, model);

    expect(primaryModel).toEqual(model);
    expect(fallbackModel).toBeNull();
  });

  it("returns no fallback when selectedModel and defaultModel share the same id", () => {
    const modelA = createModel("same-id", "Model A");
    const modelB = createModel("same-id", "Model B");

    const { fallbackModel } = resolvePreferredModels(modelA, modelB);

    expect(fallbackModel).toBeNull();
  });

  it("treats undefined selectedModel the same as null", () => {
    const defaultModel = createModel("default");

    const { primaryModel, fallbackModel } = resolvePreferredModels(undefined, defaultModel);

    expect(primaryModel).toEqual(defaultModel);
    expect(fallbackModel).toBeNull();
  });
});

// ─── buildShortcutRequest ─────────────────────────────────────────────────────

describe("buildShortcutRequest", () => {
  it("constructs a request with the provided languages", () => {
    const request = buildShortcutRequest("hello world", {
      sourceLanguage: "English",
      targetLanguage: "Chinese (Simplified)",
    });

    expect(request).toEqual({
      sourceText: "hello world",
      sourceLanguage: "English",
      targetLanguage: "Chinese (Simplified)",
    });
  });

  it("defaults sourceLanguage to 'auto' when the config value is empty", () => {
    const request = buildShortcutRequest("hi", {
      sourceLanguage: "",
      targetLanguage: "Japanese",
    });

    expect(request.sourceLanguage).toBe("auto");
    expect(request.targetLanguage).toBe("Japanese");
  });

  it("defaults targetLanguage to 'auto' when the config value is empty", () => {
    const request = buildShortcutRequest("hi", {
      sourceLanguage: "English",
      targetLanguage: "",
    });

    expect(request.sourceLanguage).toBe("English");
    expect(request.targetLanguage).toBe("auto");
  });

  it("defaults both languages to 'auto' when both config values are empty", () => {
    const request = buildShortcutRequest("hi", {
      sourceLanguage: "",
      targetLanguage: "",
    });

    expect(request.sourceLanguage).toBe("auto");
    expect(request.targetLanguage).toBe("auto");
  });
});

// ─── buildShortcutRequestKey ──────────────────────────────────────────────────

describe("buildShortcutRequestKey", () => {
  it("produces a deterministic JSON key for the same inputs", () => {
    const request = createRequest();
    const model = createModel("model-1");

    const key1 = buildShortcutRequestKey(request, model, "selection");
    const key2 = buildShortcutRequestKey(request, model, "selection");

    expect(key1).toBe(key2);
  });

  it("returns different keys for different origins", () => {
    const request = createRequest();
    const model = createModel("model-1");

    const selectionKey = buildShortcutRequestKey(request, model, "selection");
    const clipboardKey = buildShortcutRequestKey(request, model, "clipboard");

    expect(selectionKey).not.toBe(clipboardKey);
  });

  it("returns different keys for different models", () => {
    const request = createRequest();
    const modelA = createModel("model-a");
    const modelB = createModel("model-b");

    const keyA = buildShortcutRequestKey(request, modelA, "selection");
    const keyB = buildShortcutRequestKey(request, modelB, "selection");

    expect(keyA).not.toBe(keyB);
  });

  it("returns different keys for different source texts", () => {
    const modelConfig = createModel("model-1");

    const keyA = buildShortcutRequestKey(createRequest({ sourceText: "hello" }), modelConfig, "clipboard");
    const keyB = buildShortcutRequestKey(createRequest({ sourceText: "world" }), modelConfig, "clipboard");

    expect(keyA).not.toBe(keyB);
  });

  it("encodes the origin, modelId, and language fields in the key", () => {
    const request = createRequest({
      sourceText: "test",
      sourceLanguage: "English",
      targetLanguage: "Japanese",
    });
    const model = createModel("m-1");

    const key = buildShortcutRequestKey(request, model, "clipboard");
    const parsed = JSON.parse(key);

    expect(parsed).toEqual({
      origin: "clipboard",
      modelId: "m-1",
      sourceText: "test",
      sourceLanguage: "English",
      targetLanguage: "Japanese",
    });
  });
});

// ─── executeShortcutTranslation ───────────────────────────────────────────────

describe("executeShortcutTranslation", () => {
  function makeTranslationStore(
    translateDetached: (
      request: TranslateRequest,
      model?: ModelConfig | null,
    ) => Promise<TranslateResult>,
  ) {
    return {
      resolveRequest: vi.fn(async (request: TranslateRequest) => request),
      translateDetached: vi.fn(translateDetached),
    };
  }

  it("resolves and translates with the primary model on success", async () => {
    const primaryModel = createModel("primary");
    const fallbackModel = createModel("fallback");
    const result = createTranslateResult("translated");
    const translationStore = makeTranslationStore(async () => result);

    const outcome = await executeShortcutTranslation(
      {
        request: createRequest(),
        origin: "selection",
        primaryModel,
        fallbackModel,
      },
      { translationStore },
    );

    expect(translationStore.resolveRequest).toHaveBeenCalledWith(
      createRequest(),
      primaryModel,
    );
    expect(translationStore.translateDetached).toHaveBeenCalledTimes(1);
    expect(outcome.translatedText).toBe("translated");
    expect(outcome.activeModel).toEqual(primaryModel);
  });

  it("falls back to the fallback model when the primary model throws", async () => {
    const primaryModel = createModel("primary");
    const fallbackModel = createModel("fallback");
    const fallbackResult = createTranslateResult("fallback-result");
    const translationStore = makeTranslationStore(async (_request, model) => {
      if (model?.id === "primary") {
        throw new Error("primary model failed");
      }
      return fallbackResult;
    });

    const outcome = await executeShortcutTranslation(
      {
        request: createRequest(),
        origin: "clipboard",
        primaryModel,
        fallbackModel,
      },
      { translationStore },
    );

    expect(translationStore.translateDetached).toHaveBeenCalledTimes(2);
    expect(outcome.translatedText).toBe("fallback-result");
    expect(outcome.activeModel).toEqual(fallbackModel);
  });

  it("re-resolves the request with the fallback model before translating", async () => {
    const primaryModel = createModel("primary");
    const fallbackModel = createModel("fallback");
    const fallbackResult = createTranslateResult("fallback");
    const resolveRequest = vi.fn(async (request: TranslateRequest) => ({
      ...request,
      sourceLanguage: "English",
    }));
    const translateDetached = vi.fn(async (_request: TranslateRequest, model?: ModelConfig | null) => {
      if (model?.id === "primary") {
        throw new Error("primary failed");
      }
      return fallbackResult;
    });

    const outcome = await executeShortcutTranslation(
      {
        request: createRequest(),
        origin: "selection",
        primaryModel,
        fallbackModel,
      },
      { translationStore: { resolveRequest, translateDetached } },
    );

    expect(resolveRequest).toHaveBeenCalledTimes(2);
    expect(resolveRequest).toHaveBeenNthCalledWith(1, createRequest(), primaryModel);
    expect(resolveRequest).toHaveBeenNthCalledWith(2, createRequest(), fallbackModel);
    expect(outcome.resolvedRequest.sourceLanguage).toBe("English");
  });

  it("rethrows the error when there is no fallback model", async () => {
    const primaryModel = createModel("primary");
    const translationStore = makeTranslationStore(async () => {
      throw new Error("fatal error");
    });

    await expect(
      executeShortcutTranslation(
        {
          request: createRequest(),
          origin: "selection",
          primaryModel,
          fallbackModel: null,
        },
        { translationStore },
      ),
    ).rejects.toThrow("fatal error");
  });

  it("returns the resolved request and active model in the outcome", async () => {
    const primaryModel = createModel("primary");
    const resolvedRequest: TranslateRequest = {
      ...createRequest(),
      sourceLanguage: "English",
    };
    const translationStore = {
      resolveRequest: vi.fn(async () => resolvedRequest),
      translateDetached: vi.fn(async () => createTranslateResult("done")),
    };

    const outcome = await executeShortcutTranslation(
      {
        request: createRequest(),
        origin: "clipboard",
        primaryModel,
        fallbackModel: null,
      },
      { translationStore },
    );

    expect(outcome.resolvedRequest).toEqual(resolvedRequest);
    expect(outcome.activeModel).toEqual(primaryModel);
    expect(outcome.translatedText).toBe("done");
  });
});
