import { flushPromises } from "@vue/test-utils";
import { reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPreferences } from "@/constants/app";
import type { ModelConfig } from "@/types/app";
import type { TranslateRequest, TranslateResult } from "@/types/ai";

const mocked = vi.hoisted(() => ({
  appConfigStore: null as any,
  resolveTranslationRequest: vi.fn(),
  translateText: vi.fn(),
  translateImageWithOcr: vi.fn(),
  loadCachedTranslation: vi.fn(),
  saveCachedTranslation: vi.fn(),
  trimTranslationCache: vi.fn(),
  clearTranslationCache: vi.fn(),
  loadTranslationHistory: vi.fn(),
  saveTranslationHistory: vi.fn(),
  clearTranslationHistory: vi.fn(),
  logger: {
    info: vi.fn(async () => {}),
    warn: vi.fn(async () => {}),
    error: vi.fn(async () => {}),
  },
}));

vi.mock("@/stores/appConfig", () => ({
  useAppConfigStore: () => mocked.appConfigStore,
}));

vi.mock("@/services/logging/logger", () => ({
  createLogger: () => mocked.logger,
  createRequestId: () => "request-1",
  createTraceId: () => "trace-1",
}));

vi.mock("@/services/ai/translationRequestResolver", () => ({
  resolveTranslationRequest: mocked.resolveTranslationRequest,
}));

vi.mock("@/services/ai/translationService", () => ({
  translateText: mocked.translateText,
}));

vi.mock("@/services/ocr/imageTranslationService", () => ({
  translateImageWithOcr: mocked.translateImageWithOcr,
}));

vi.mock("@/services/storage/translationCacheStorage", () => ({
  clearTranslationCache: mocked.clearTranslationCache,
  loadCachedTranslation: mocked.loadCachedTranslation,
  saveCachedTranslation: mocked.saveCachedTranslation,
  trimTranslationCache: mocked.trimTranslationCache,
}));

vi.mock("@/services/storage/translationHistoryStorage", () => ({
  clearTranslationHistory: mocked.clearTranslationHistory,
  loadTranslationHistory: mocked.loadTranslationHistory,
  saveTranslationHistory: mocked.saveTranslationHistory,
}));

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
    systemPrompt: "Translate accurately",
    timeoutMs: 60_000,
    createdAt: "2026-04-07T00:00:00.000Z",
    updatedAt: "2026-04-07T00:00:00.000Z",
  };
}

function createImageRequest(): TranslateRequest {
  return {
    sourceText: "Translate Text\nCopy page",
    sourceLanguage: "auto",
    targetLanguage: "Chinese (Simplified)",
    sourceImage: {
      dataUrl: "data:image/png;base64,abc123",
      mimeType: "image/png",
      name: "capture.png",
      width: 800,
      height: 600,
    },
    sourceImageOcr: {
      engineId: "rapidocr",
      engineVersion: "0.2.0",
      imageWidth: 800,
      imageHeight: 600,
      blocks: [
        {
          id: "block-1",
          order: 0,
          sourceText: "Translate Text",
          score: 0.99,
          box: [[24, 40], [240, 40], [240, 96], [24, 96]],
          bbox: { x: 24, y: 40, width: 216, height: 56 },
        },
        {
          id: "block-2",
          order: 1,
          sourceText: "Copy page",
          score: 0.95,
          box: [[24, 104], [200, 104], [200, 144], [24, 144]],
          bbox: { x: 24, y: 104, width: 176, height: 40 },
        },
      ],
    },
  };
}

function createFinalResult(modelConfig: ModelConfig): TranslateResult {
  return {
    mode: "image",
    text: "translated line one\ntranslated line two",
    model: modelConfig.model,
    provider: modelConfig.provider,
    raw: null,
    imageTranslation: {
      ocr: {
        engine: {
          engineId: "rapidocr",
          engineVersion: "0.2.0",
        },
        blocks: createImageRequest().sourceImageOcr!.blocks,
      },
      translation: {
        blocks: [
          {
            blockId: "block-1",
            sourceText: "Translate Text",
            translatedText: "translated line one",
            bbox: { x: 24, y: 40, width: 216, height: 56 },
          },
          {
            blockId: "block-2",
            sourceText: "Copy page",
            translatedText: "translated line two",
            bbox: { x: 24, y: 104, width: 176, height: 40 },
          },
        ],
        fullText: "translated line one\ntranslated line two",
      },
      render: {
        imageDataUrl: "data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E",
        width: 800,
        height: 600,
      },
    },
  };
}

function createStores() {
  const preferences = createDefaultPreferences();
  const defaultModel = createModelConfig();

  mocked.appConfigStore = reactive({
    initialized: true,
    preferences,
    defaultModel,
    selectedTranslationModel: defaultModel,
    initialize: vi.fn(async () => {
      mocked.appConfigStore.initialized = true;
    }),
  });
}

describe("useTranslationStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.stubGlobal("BroadcastChannel", undefined);
    createStores();

    mocked.resolveTranslationRequest.mockImplementation(async (_model: ModelConfig, request: TranslateRequest) => ({
      resolvedRequest: request,
    }));
    mocked.loadCachedTranslation.mockResolvedValue(null);
    mocked.saveCachedTranslation.mockResolvedValue(undefined);
    mocked.trimTranslationCache.mockResolvedValue(undefined);
    mocked.loadTranslationHistory.mockResolvedValue([]);
    mocked.saveTranslationHistory.mockResolvedValue(undefined);
  });

  it("streams visible image translation text before restoring the translated image preview", async () => {
    const modelConfig = createModelConfig();
    const request = createImageRequest();
    const finalResult = createFinalResult(modelConfig);
    let resolveTranslation: (value: TranslateResult) => void = () => {};

    mocked.translateImageWithOcr.mockImplementation(
      async (
        _model: ModelConfig,
        _request: TranslateRequest,
        _engineId: string,
        handlers?: {
          onTextDelta?: (delta: string) => void;
          onTextProgress?: (payload: {
            fullText: string;
            blocks: Array<{
              blockId: string;
              sourceText: string;
              translatedText: string;
              bbox: { x: number; y: number; width: number; height: number };
            }>;
            render: {
              imageDataUrl: string;
              width: number;
              height: number;
            };
          }) => void;
        },
      ) =>
        await new Promise<TranslateResult>((resolve) => {
          handlers?.onTextDelta?.("translated ");
          handlers?.onTextProgress?.({
            fullText: "translated ",
            blocks: [
              {
                blockId: "block-1",
                sourceText: "Translate Text",
                translatedText: "translated ",
                bbox: { x: 24, y: 40, width: 216, height: 56 },
              },
              {
                blockId: "block-2",
                sourceText: "Copy page",
                translatedText: "",
                bbox: { x: 24, y: 104, width: 176, height: 40 },
              },
            ],
            render: {
              imageDataUrl: "data:image/svg+xml;charset=utf-8,%3Csvg%3Epartial%3C/svg%3E",
              width: 800,
              height: 600,
            },
          });
          handlers?.onTextDelta?.("line one\ntranslated line two");
          resolveTranslation = resolve;
        }),
    );

    const { useTranslationStore } = await import("@/stores/translation");
    const store = useTranslationStore();
    const pendingTranslation = store.translate(request, modelConfig);

    await flushPromises();

    expect(store.loading).toBe(true);
    expect(store.currentResult?.text).toBe("translated line one\ntranslated line two");
    expect(store.currentResult?.imageTranslation?.render.imageDataUrl).toContain("partial");

    resolveTranslation(finalResult);
    await pendingTranslation;

    expect(store.loading).toBe(false);
    expect(store.currentResult?.text).toBe("translated line one\ntranslated line two");
    expect(store.currentResult?.imageTranslation?.render.imageDataUrl).toContain("data:image/svg+xml");
  });
});
