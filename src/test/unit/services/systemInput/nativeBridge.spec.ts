import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
  isTauri: mocked.isTauri,
}));

describe("systemInput nativeBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.isTauri.mockReturnValue(true);
  });

  it("returns an unsupported status outside Tauri", async () => {
    mocked.isTauri.mockReturnValue(false);

    const { initializeSystemInputNative } = await import("@/services/systemInput/nativeBridge");
    const status = await initializeSystemInputNative({
      enabled: false,
      translateSelectionShortcut: "Ctrl+1",
      translateClipboardShortcut: "Ctrl+2",
      pasteLastTranslationShortcut: "Ctrl+3",
      toggleEnabledShortcut: "Ctrl+4",
      targetLanguageSwitchShortcut: "Ctrl+`",
      sourceLanguage: "auto",
    });

    expect(status).toEqual(
      expect.objectContaining({
        platform: "web",
        lastError: "当前环境不支持系统级快捷输入。",
      }),
    );
    expect(mocked.invoke).not.toHaveBeenCalled();
  });

  it("invokes native commands for selection capture and paste", async () => {
    mocked.invoke
      .mockResolvedValueOnce("hello world")
      .mockResolvedValueOnce(true);

    const { captureSystemSelectedText, pasteSystemInputText } = await import(
      "@/services/systemInput/nativeBridge"
    );

    const captureResult = await captureSystemSelectedText();
    const pasteResult = await pasteSystemInputText("你好世界", {
      processId: 1234,
      processName: "notepad.exe",
    });

    expect(captureResult).toBe("hello world");
    expect(pasteResult).toBe(true);
    expect(mocked.invoke).toHaveBeenNthCalledWith(
      1,
      "system_input_capture_selected_text",
      undefined,
    );
    expect(mocked.invoke).toHaveBeenNthCalledWith(2, "system_input_paste_text", {
      text: "你好世界",
      targetApp: {
        processId: 1234,
        processName: "notepad.exe",
      },
    });
  });
});
