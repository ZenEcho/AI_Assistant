import { describe, expect, it } from "vitest";
import { renderImageTranslationOverlay } from "@/services/ocr/imageOverlayRenderer";

describe("imageOverlayRenderer", () => {
  it("renders an SVG overlay image that keeps translated text aligned to OCR boxes", () => {
    const result = renderImageTranslationOverlay({
      sourceImage: {
        dataUrl: "data:image/png;base64,abc123",
        mimeType: "image/png",
        name: "capture.png",
        width: 800,
        height: 600,
      },
      translatedBlocks: [
        {
          blockId: "block-1",
          sourceText: "Translate Text",
          translatedText: "翻译文本",
          bbox: {
            x: 24,
            y: 40,
            width: 200,
            height: 56,
          },
        },
      ],
    });

    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    expect(result.imageDataUrl.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);

    const decoded = decodeURIComponent(result.imageDataUrl.replace("data:image/svg+xml;charset=utf-8,", ""));
    expect(decoded).toContain("data:image/png;base64,abc123");
    expect(decoded).toContain("翻译文本");
    expect(decoded).toContain('x="24"');
    expect(decoded).toContain('y="40"');
  });
});
