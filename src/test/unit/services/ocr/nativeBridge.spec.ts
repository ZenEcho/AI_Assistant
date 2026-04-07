import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
  isTauri: mocked.isTauri,
}));

describe("ocr nativeBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.isTauri.mockReturnValue(true);
  });

  it("returns default not-installed statuses outside Tauri", async () => {
    mocked.isTauri.mockReturnValue(false);

    const { listOcrEngineStatuses } = await import("@/services/ocr/nativeBridge");
    const result = await listOcrEngineStatuses();

    expect(result).toEqual([
      expect.objectContaining({
        engineId: "rapidocr",
        status: "not-installed",
      }),
      expect.objectContaining({
        engineId: "paddleocr",
        status: "not-installed",
      }),
    ]);
    expect(mocked.invoke).not.toHaveBeenCalled();
  });

  it("invokes engine listing, download and recognition commands", async () => {
    mocked.invoke
      .mockResolvedValueOnce([
        {
          engineId: "rapidocr",
          status: "installed",
          version: "0.2.0",
          downloadProgress: null,
          errorMessage: null,
        },
      ])
      .mockResolvedValueOnce({
        engineId: "rapidocr",
        status: "downloading",
        version: null,
        downloadProgress: 42,
        errorMessage: null,
      })
      .mockResolvedValueOnce({
        engineId: "rapidocr",
        engineVersion: "0.2.0",
        imageWidth: 1000,
        imageHeight: 800,
        blocks: [
          {
            id: "block-1",
            order: 0,
            sourceText: "Hello",
            score: 0.99,
            box: [[0, 0], [10, 0], [10, 10], [0, 10]],
            bbox: { x: 0, y: 0, width: 10, height: 10 },
          },
        ],
      });

    const { listOcrEngineStatuses, downloadOcrEngine, recognizeImageWithOcr } = await import(
      "@/services/ocr/nativeBridge"
    );

    const statuses = await listOcrEngineStatuses();
    const download = await downloadOcrEngine("rapidocr");
    const recognition = await recognizeImageWithOcr("rapidocr", {
      dataUrl: "data:image/png;base64,abc123",
      mimeType: "image/png",
      name: "capture.png",
      width: 1000,
      height: 800,
    });

    expect(statuses[0]?.engineId).toBe("rapidocr");
    expect(download.status).toBe("downloading");
    expect(recognition.blocks[0]?.sourceText).toBe("Hello");
    expect(mocked.invoke).toHaveBeenNthCalledWith(1, "ocr_list_engine_statuses", undefined);
    expect(mocked.invoke).toHaveBeenNthCalledWith(2, "ocr_download_engine", {
      engineId: "rapidocr",
    });
    expect(mocked.invoke).toHaveBeenNthCalledWith(3, "ocr_recognize_image", {
      engineId: "rapidocr",
      image: expect.objectContaining({
        dataUrl: "data:image/png;base64,abc123",
      }),
    });
  });
});
