import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelConfig } from "@/types/app";
import type { TranslateRequest } from "@/types/ai";

const mocked = vi.hoisted(() => ({
  translateText: vi.fn(),
}));

vi.mock("@/services/ai/translationService", () => ({
  translateText: mocked.translateText,
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

describe("imageTranslationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("translates merged OCR text once and returns an image translation result", async () => {
    mocked.translateText.mockResolvedValue({
      text: "translated line one\ntranslated line two",
      model: "gpt-4o-mini",
      provider: "openai-compatible",
      raw: null,
    });

    const { translateImageWithOcr } = await import("@/services/ocr/imageTranslationService");
    const result = await translateImageWithOcr(createModelConfig(), createImageRequest(), "rapidocr");

    expect(mocked.translateText).toHaveBeenCalledTimes(1);
    expect(mocked.translateText).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        sourceText: "Translate Text\nCopy page",
        sourceImage: null,
        sourceImageOcr: null,
      }),
      expect.objectContaining({
        onTextDelta: expect.any(Function),
      }),
      undefined,
    );
    expect(result.mode).toBe("image");
    expect(result.text).toBe("translated line one\ntranslated line two");

    const imageTranslation = result.imageTranslation;
    expect(imageTranslation).toBeTruthy();
    expect(imageTranslation!.ocr.engine.engineId).toBe("rapidocr");
    expect(imageTranslation!.translation.blocks[0]?.translatedText).toBe("translated line one");
    expect(imageTranslation!.translation.blocks[1]?.translatedText).toBe("translated line two");
    expect(imageTranslation!.render.imageDataUrl).toContain("data:image/svg+xml");
  });

  it("emits merged translated text progress once before the image overlay is rendered", async () => {
    mocked.translateText.mockResolvedValue({
      text: "translated line one\ntranslated line two",
      model: "gpt-4o-mini",
      provider: "openai-compatible",
      raw: null,
    });

    const onTextProgress = vi.fn();
    const { translateImageWithOcr } = await import("@/services/ocr/imageTranslationService");

    await translateImageWithOcr(
      createModelConfig(),
      createImageRequest(),
      "rapidocr",
      {
        onTextProgress,
      },
    );

    expect(onTextProgress).toHaveBeenCalledTimes(1);
    expect(onTextProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        fullText: "translated line one\ntranslated line two",
        render: expect.objectContaining({
          imageDataUrl: expect.stringContaining("data:image/svg+xml"),
          width: 800,
          height: 600,
        }),
      }),
    );
  });

  it("forwards streamed text deltas while waiting for the final image overlay", async () => {
    mocked.translateText.mockImplementation(
      async (_model, _request, handlers) => {
        handlers?.onTextDelta?.("translated ");
        handlers?.onTextDelta?.("line one\ntranslated line two");

        return {
          text: "translated line one\ntranslated line two",
          model: "gpt-4o-mini",
          provider: "openai-compatible",
          raw: null,
        };
      },
    );

    const onTextDelta = vi.fn();
    const { translateImageWithOcr } = await import("@/services/ocr/imageTranslationService");

    await translateImageWithOcr(
      createModelConfig(),
      createImageRequest(),
      "rapidocr",
      {
        onTextDelta,
      },
    );

    expect(onTextDelta).toHaveBeenCalledTimes(2);
    expect(onTextDelta).toHaveBeenNthCalledWith(1, "translated ");
    expect(onTextDelta).toHaveBeenNthCalledWith(2, "line one\ntranslated line two");
  });

  it("updates image progress with provisional overlay renders while streaming", async () => {
    mocked.translateText.mockImplementation(
      async (_model, _request, handlers) => {
        handlers?.onTextDelta?.("translated ");
        handlers?.onTextDelta?.("line one\ntranslated line two");

        return {
          text: "translated line one\ntranslated line two",
          model: "gpt-4o-mini",
          provider: "openai-compatible",
          raw: null,
        };
      },
    );

    const onTextProgress = vi.fn();
    const { translateImageWithOcr } = await import("@/services/ocr/imageTranslationService");

    await translateImageWithOcr(
      createModelConfig(),
      createImageRequest(),
      "rapidocr",
      {
        onTextProgress,
      },
    );

    expect(onTextProgress).toHaveBeenCalledTimes(3);
    expect(onTextProgress).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fullText: "translated ",
        render: expect.objectContaining({
          imageDataUrl: expect.stringContaining("data:image/svg+xml"),
        }),
      }),
    );
    expect(onTextProgress).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fullText: "translated line one\ntranslated line two",
      }),
    );
    expect(onTextProgress).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        fullText: "translated line one\ntranslated line two",
      }),
    );
  });

  it("maps translated lines back to OCR blocks according to OCR order", async () => {
    mocked.translateText.mockResolvedValue({
      text: "translated first\ntranslated second",
      model: "gpt-4o-mini",
      provider: "openai-compatible",
      raw: null,
    });

    const request = createImageRequest();
    request.sourceImageOcr!.blocks = [
      request.sourceImageOcr!.blocks[1]!,
      request.sourceImageOcr!.blocks[0]!,
    ];

    const { translateImageWithOcr } = await import("@/services/ocr/imageTranslationService");
    const result = await translateImageWithOcr(createModelConfig(), request, "rapidocr");

    expect(result.imageTranslation?.translation.blocks).toEqual([
      expect.objectContaining({
        blockId: "block-1",
        translatedText: "translated first",
      }),
      expect.objectContaining({
        blockId: "block-2",
        translatedText: "translated second",
      }),
    ]);
  });

  it("throws when image OCR data is missing from the request", async () => {
    const { translateImageWithOcr } = await import("@/services/ocr/imageTranslationService");

    await expect(
      translateImageWithOcr(
        createModelConfig(),
        {
          ...createImageRequest(),
          sourceImageOcr: null,
        },
        "rapidocr",
      ),
    ).rejects.toThrow("Missing OCR data for image translation.");
  });
});
