import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  const resultWindow = {
    label: "result",
    show: vi.fn(async () => {}),
    hide: vi.fn(async () => {}),
    unminimize: vi.fn(async () => {}),
    setFocus: vi.fn(async () => {}),
    isVisible: vi.fn(async () => false),
    isMinimized: vi.fn(async () => false),
  };

  const currentWindow = {
    label: "main",
    once: vi.fn(async () => vi.fn()),
    emitTo: vi.fn(async () => {}),
  };

  return {
    isTauri: vi.fn(() => true),
    getByLabel: vi.fn(async (label: string) => (label === "result" ? resultWindow : null)),
    currentWindow,
    resultWindow,
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: mocked.isTauri,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => mocked.currentWindow,
}));

vi.mock("@tauri-apps/api/webviewWindow", () => {
  class MockWebviewWindow {
    static getByLabel(label: string) {
      return mocked.getByLabel(label);
    }
  }

  return {
    WebviewWindow: MockWebviewWindow,
  };
});

describe("windowManager result window helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.isTauri.mockReturnValue(true);
    mocked.getByLabel.mockImplementation(async (label: string) => (label === "result" ? mocked.resultWindow : null));
    mocked.resultWindow.isVisible.mockResolvedValue(false);
    mocked.resultWindow.isMinimized.mockResolvedValue(false);
  });

  it("focuses the existing result window when a new translation is requested", async () => {
    const { requestTranslationInResultWindow, RESULT_WINDOW_LABEL, TRANSLATION_RESULT_RUN_EVENT } =
      await import("@/services/window/windowManager");

    await requestTranslationInResultWindow({
      modelId: "model-1",
      request: {
        sourceText: "hello",
        sourceLanguage: "auto",
        targetLanguage: "English",
      },
    });

    expect(mocked.resultWindow.show).toHaveBeenCalledTimes(1);
    expect(mocked.resultWindow.unminimize).toHaveBeenCalledTimes(1);
    expect(mocked.resultWindow.setFocus).toHaveBeenCalledTimes(1);
    expect(mocked.currentWindow.emitTo).toHaveBeenCalledWith(
      RESULT_WINDOW_LABEL,
      TRANSLATION_RESULT_RUN_EVENT,
      expect.objectContaining({
        modelId: "model-1",
      }),
    );
  });

  it("hides the visible result window when toggled", async () => {
    const { toggleResultWindowVisibility } = await import("@/services/window/windowManager");
    mocked.resultWindow.isVisible.mockResolvedValue(true);

    const visible = await toggleResultWindowVisibility();

    expect(visible).toBe(false);
    expect(mocked.resultWindow.hide).toHaveBeenCalledTimes(1);
  });

  it("shows and focuses the hidden result window when toggled", async () => {
    const { toggleResultWindowVisibility } = await import("@/services/window/windowManager");
    mocked.resultWindow.isVisible.mockResolvedValue(false);

    const visible = await toggleResultWindowVisibility();

    expect(visible).toBe(true);
    expect(mocked.resultWindow.show).toHaveBeenCalledTimes(1);
    expect(mocked.resultWindow.unminimize).toHaveBeenCalledTimes(1);
    expect(mocked.resultWindow.setFocus).toHaveBeenCalledTimes(1);
  });
});
