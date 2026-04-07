import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  listOcrEngineStatuses: vi.fn(),
  downloadOcrEngine: vi.fn(),
}));

vi.mock("@/services/ocr/nativeBridge", () => ({
  listOcrEngineStatuses: mocked.listOcrEngineStatuses,
  downloadOcrEngine: mocked.downloadOcrEngine,
}));

describe("useOcrStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it("loads runtime engine statuses and updates the selected engine on download", async () => {
    mocked.listOcrEngineStatuses.mockResolvedValue([
      {
        engineId: "rapidocr",
        status: "installed",
        version: "0.2.0",
        downloadProgress: null,
        errorMessage: null,
      },
      {
        engineId: "paddleocr",
        status: "not-installed",
        version: null,
        downloadProgress: null,
        errorMessage: null,
      },
    ]);
    mocked.downloadOcrEngine.mockResolvedValue({
      engineId: "paddleocr",
      status: "downloading",
      version: null,
      downloadProgress: 25,
      errorMessage: null,
    });

    const { useOcrStore } = await import("@/stores/ocr");
    const store = useOcrStore();

    await store.refreshStatuses();
    await store.downloadEngine("paddleocr");

    expect(store.statuses[0]?.engineId).toBe("rapidocr");
    expect(store.getStatus("paddleocr")?.downloadProgress).toBe(25);
  });
});
