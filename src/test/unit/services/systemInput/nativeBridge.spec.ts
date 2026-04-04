import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
  isTauri: mocked.isTauri,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mocked.listen,
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
      config: {
        enabled: false,
        triggerMode: "double-space",
        doubleTapIntervalMs: 280,
        translateSelectionShortcut: "Ctrl+1",
        translateClipboardShortcut: "Ctrl+2",
        pasteLastTranslationShortcut: "Ctrl+3",
        toggleEnabledShortcut: "Ctrl+4",
        appBlacklist: [],
        appWhitelist: [],
        sourceLanguage: "auto",
        targetLanguage: "Chinese (Simplified)",
        onlySelectedText: false,
        autoReplace: true,
        replaceSelectionOnShortcutTranslate: true,
        enableClipboardFallback: true,
        showFloatingHint: true,
        onlyWhenEnglishText: true,
        excludeCodeEditors: true,
        debugLogging: false,
        captureMode: "before-caret-first",
        writebackMode: "auto",
      },
      appWindowLabels: ["main", "settings", "result"],
    });

    expect(status).toEqual(
      expect.objectContaining({
        platform: "web",
        lastError: "当前环境不支持系统级输入增强。",
      }),
    );
    expect(mocked.invoke).not.toHaveBeenCalled();
  });

  it("invokes native commands for contextual capture and paste", async () => {
    mocked.invoke
      .mockResolvedValueOnce({
        text: "hello world",
        targetApp: {
          processId: 1234,
          processName: "notepad.exe",
        },
      })
      .mockResolvedValueOnce(true);

    const { captureSystemSelectedTextWithContext, pasteSystemInputText } = await import(
      "@/services/systemInput/nativeBridge"
    );

    const captureResult = await captureSystemSelectedTextWithContext();
    const pasteResult = await pasteSystemInputText("你好世界", {
      processId: 1234,
      processName: "notepad.exe",
    });

    expect(captureResult).toEqual(
      expect.objectContaining({
        text: "hello world",
      }),
    );
    expect(pasteResult).toBe(true);
    expect(mocked.invoke).toHaveBeenNthCalledWith(
      1,
      "system_input_capture_selected_text_with_context",
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

  it("returns a popup fallback when submitting translation outside Tauri", async () => {
    mocked.isTauri.mockReturnValue(false);

    const { submitSystemInputTranslation } = await import("@/services/systemInput/nativeBridge");
    const result = await submitSystemInputTranslation({
      sessionId: "session-1",
      request: {
        sourceText: "hello",
        sourceLanguage: "auto",
        targetLanguage: "Chinese (Simplified)",
      },
      translatedText: "你好",
      sourceText: "hello",
      captureStrategy: "selection-first",
      targetApp: {
        processName: "notepad.exe",
      },
      openResultWindowOnFailure: true,
    });

    expect(result).toEqual({
      sessionId: "session-1",
      success: false,
      usedStrategy: "popup-only",
      fallbackWindowRequired: true,
      error: "当前环境不支持系统级输入增强。",
    });
  });

  it("forwards translation request events to the caller handler", async () => {
    const unlisten = vi.fn();
    let nativeHandler: ((event: { payload: { sessionId: string } }) => void) | undefined;

    mocked.listen.mockImplementation(async (_eventName, handler) => {
      nativeHandler = handler as (event: { payload: { sessionId: string } }) => void;
      return unlisten;
    });

    const {
      listenSystemInputTranslationRequest,
      SYSTEM_INPUT_TRANSLATION_REQUEST_EVENT,
    } = await import("@/services/systemInput/nativeBridge");
    const handler = vi.fn();

    const result = await listenSystemInputTranslationRequest(handler);
    if (nativeHandler) {
      nativeHandler({ payload: { sessionId: "session-1" } });
    }

    expect(mocked.listen).toHaveBeenCalledWith(
      SYSTEM_INPUT_TRANSLATION_REQUEST_EVENT,
      expect.any(Function),
    );
    expect(handler).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(result).toBe(unlisten);
  });
});
