import { flushPromises } from "@vue/test-utils";
import { nextTick, reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPreferences } from "@/constants/app";
import { createDefaultSystemInputStatus, type SystemInputTranslationRequestEvent } from "@/types/systemInput";

const mocked = vi.hoisted(() => ({
  appConfigStore: null as any,
  translationStore: null as any,
  hasSystemInputTargetLanguageOverlaySession: vi.fn(() => false),
  beginSystemInputTargetLanguageOverlaySession: vi.fn(),
  clearSystemInputTargetLanguageOverlaySession: vi.fn(),
  isSystemInputTargetLanguageOverlayActive: vi.fn(async () => false),
  presentTranslationResultInResultWindow: vi.fn(),
  showSystemInputTargetLanguageOverlay: vi.fn(async () => null),
  runSystemInputTranslationSession: vi.fn(),
  initializeSystemInputNative: vi.fn(),
  updateSystemInputNativeConfig: vi.fn(),
  getSystemInputNativeStatus: vi.fn(),
  captureSystemSelectedText: vi.fn(),
  captureSystemSelectedTextWithContext: vi.fn(),
  readSystemClipboardText: vi.fn(),
  pasteSystemInputText: vi.fn(),
  submitSystemInputTranslation: vi.fn(),
  cancelSystemInputSession: vi.fn(),
  listenSystemInputStatus: vi.fn(),
  listenSystemInputTranslationRequest: vi.fn(),
  listenSystemInputWritebackResult: vi.fn(),
  showSystemInputNotification: vi.fn(),
  translationRequestListener: null as null | ((event: SystemInputTranslationRequestEvent) => void),
  statusListener: null as null | ((payload: unknown) => void),
  writebackResultListener: null as null | ((payload: unknown) => void),
}));

vi.mock("@/stores/appConfig", () => ({
  useAppConfigStore: () => mocked.appConfigStore,
}));

vi.mock("@/stores/translation", () => ({
  useTranslationStore: () => mocked.translationStore,
}));

vi.mock("@/services/window/windowManager", () => ({
  hasSystemInputTargetLanguageOverlaySession: mocked.hasSystemInputTargetLanguageOverlaySession,
  beginSystemInputTargetLanguageOverlaySession: mocked.beginSystemInputTargetLanguageOverlaySession,
  clearSystemInputTargetLanguageOverlaySession: mocked.clearSystemInputTargetLanguageOverlaySession,
  isSystemInputTargetLanguageOverlayActive: mocked.isSystemInputTargetLanguageOverlayActive,
  presentTranslationResultInResultWindow: mocked.presentTranslationResultInResultWindow,
  showSystemInputTargetLanguageOverlay: mocked.showSystemInputTargetLanguageOverlay,
}));

vi.mock("@/services/systemInput/sessionOrchestrator", () => ({
  runSystemInputTranslationSession: mocked.runSystemInputTranslationSession,
}));

vi.mock("@/services/systemInput/selfExclusion", () => ({
  resolveSystemInputExcludedWindowLabels: () => ["main", "settings", "result"],
}));

vi.mock("@/services/systemInput/nativeBridge", () => ({
  initializeSystemInputNative: mocked.initializeSystemInputNative,
  updateSystemInputNativeConfig: mocked.updateSystemInputNativeConfig,
  getSystemInputNativeStatus: mocked.getSystemInputNativeStatus,
  captureSystemSelectedText: mocked.captureSystemSelectedText,
  captureSystemSelectedTextWithContext: mocked.captureSystemSelectedTextWithContext,
  readSystemClipboardText: mocked.readSystemClipboardText,
  pasteSystemInputText: mocked.pasteSystemInputText,
  submitSystemInputTranslation: mocked.submitSystemInputTranslation,
  cancelSystemInputSession: mocked.cancelSystemInputSession,
  listenSystemInputStatus: mocked.listenSystemInputStatus,
  listenSystemInputTranslationRequest: mocked.listenSystemInputTranslationRequest,
  listenSystemInputWritebackResult: mocked.listenSystemInputWritebackResult,
}));

vi.mock("@/services/systemInput/systemNotification", () => ({
  showSystemInputNotification: mocked.showSystemInputNotification,
}));

function createTranslationRequestEvent(
  overrides?: Partial<SystemInputTranslationRequestEvent>,
): SystemInputTranslationRequestEvent {
  return {
    sessionId: "session-1",
    triggerMode: "double-alt",
    sourceLanguage: "auto",
    targetLanguage: "English",
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

function createStores() {
  const preferences = createDefaultPreferences();
  const defaultModel = {
    id: "model-1",
    name: "Default Model",
    provider: "openai-compatible" as const,
    baseUrl: "https://api.example.com/v1",
    apiKey: "test-key",
    model: "gpt-4o-mini",
    enabled: true,
    isDefault: true,
    systemPrompt: "translate",
    timeoutMs: 60_000,
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:00:00.000Z",
  };

  mocked.appConfigStore = reactive({
    initialized: true,
    preferences,
    defaultModel,
    selectedTranslationModel: defaultModel,
    initialize: vi.fn(async () => {
      mocked.appConfigStore.initialized = true;
    }),
    updateSystemInputConfig: vi.fn(async (patch: Record<string, unknown>) => {
      Object.assign(mocked.appConfigStore.preferences.systemInput, patch);
    }),
  });

  mocked.translationStore = reactive({
    resolveRequest: vi.fn(async (request) => request),
    translateDetached: vi.fn(),
    presentResult: vi.fn(),
  });
}

describe("useSystemInputStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    createStores();

    mocked.initializeSystemInputNative.mockResolvedValue({
      ...createDefaultSystemInputStatus(),
      nativeReady: true,
      active: true,
      platform: "windows",
      permissionState: "not-required",
    });
    mocked.updateSystemInputNativeConfig.mockImplementation(async (config) => ({
      ...createDefaultSystemInputStatus(),
      nativeReady: true,
      active: Boolean(config.enabled),
      platform: "windows",
      permissionState: "not-required",
    }));
    mocked.getSystemInputNativeStatus.mockResolvedValue(createDefaultSystemInputStatus());
    mocked.captureSystemSelectedText.mockResolvedValue(null);
    mocked.captureSystemSelectedTextWithContext.mockResolvedValue(null);
    mocked.readSystemClipboardText.mockResolvedValue(null);
    mocked.pasteSystemInputText.mockResolvedValue(true);
    mocked.submitSystemInputTranslation.mockResolvedValue({
      sessionId: "session-1",
      success: true,
      usedStrategy: "native-replace",
      fallbackWindowRequired: false,
      error: null,
    });
    mocked.cancelSystemInputSession.mockResolvedValue(undefined);
    mocked.showSystemInputNotification.mockResolvedValue(true);

    mocked.listenSystemInputStatus.mockImplementation(async (listener) => {
      mocked.statusListener = listener;
      return () => {
        mocked.statusListener = null;
      };
    });
    mocked.listenSystemInputTranslationRequest.mockImplementation(async (listener) => {
      mocked.translationRequestListener = listener;
      return () => {
        mocked.translationRequestListener = null;
      };
    });
    mocked.listenSystemInputWritebackResult.mockImplementation(async (listener) => {
      mocked.writebackResultListener = listener;
      return () => {
        mocked.writebackResultListener = null;
      };
    });
  });

  it("does not show a progress hint before writeback when auto replace is enabled", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const deferred = createDeferred<void>();
    mocked.runSystemInputTranslationSession.mockReturnValue(deferred.promise);

    const store = useSystemInputStore();
    await store.initialize();

    mocked.translationRequestListener?.(createTranslationRequestEvent());
    await flushPromises();

    expect(mocked.presentTranslationResultInResultWindow).not.toHaveBeenCalled();

    deferred.resolve();
    await flushPromises();
  });

  it("shows a progress hint immediately when popup only mode is enabled", async () => {
    mocked.appConfigStore.preferences.systemInput.writebackMode = "popup-only";

    const { useSystemInputStore } = await import("@/stores/systemInput");
    const deferred = createDeferred<void>();
    mocked.runSystemInputTranslationSession.mockReturnValue(deferred.promise);

    const store = useSystemInputStore();
    await store.initialize();

    mocked.translationRequestListener?.(createTranslationRequestEvent());
    await flushPromises();

    expect(mocked.presentTranslationResultInResultWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        modelName: "系统输入增强",
        result: expect.objectContaining({
          text: "正在翻译，请稍候…",
        }),
      }),
    );

    deferred.resolve();
    await flushPromises();
  });

  it("cancels the native session and shows an error hint when translation fails", async () => {
    mocked.appConfigStore.preferences.systemInput.writebackMode = "popup-only";

    const { useSystemInputStore } = await import("@/stores/systemInput");
    mocked.runSystemInputTranslationSession.mockRejectedValue(new Error("translation failed"));

    const store = useSystemInputStore();
    await store.initialize();

    mocked.translationRequestListener?.(createTranslationRequestEvent());
    await flushPromises();

    expect(mocked.cancelSystemInputSession).toHaveBeenCalledWith({
      sessionId: "session-1",
      error: "translation failed",
    });
    expect(mocked.presentTranslationResultInResultWindow).toHaveBeenLastCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          text: "translation failed",
        }),
      }),
    );
    expect(store.activeSessionId).toBeNull();
  });

  it("reuses the previous double-alt translation when the source text is unchanged", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    mocked.runSystemInputTranslationSession.mockResolvedValue({
      requestEvent: createTranslationRequestEvent(),
      request: {
        sourceText: "hello world",
        sourceLanguage: "auto",
        targetLanguage: "English",
      },
      result: {
        text: "你好世界",
        model: "gpt-4o-mini",
        provider: "openai-compatible",
        raw: null,
      },
      modelName: "Default Model",
      writeback: {
        sessionId: "session-1",
        success: true,
        usedStrategy: "native-replace",
        fallbackWindowRequired: false,
        error: null,
      },
    });

    const store = useSystemInputStore();
    await store.initialize();

    mocked.translationRequestListener?.(createTranslationRequestEvent());
    await flushPromises();

    mocked.submitSystemInputTranslation.mockClear();
    mocked.translationRequestListener?.(createTranslationRequestEvent({
      sessionId: "session-2",
      emittedAt: "1710000000001",
    }));
    await flushPromises();

    expect(mocked.runSystemInputTranslationSession).toHaveBeenCalledTimes(1);
    expect(mocked.submitSystemInputTranslation).toHaveBeenCalledWith({
      sessionId: "session-2",
      request: {
        sourceText: "hello world",
        sourceLanguage: "auto",
        targetLanguage: "English",
      },
      translatedText: "你好世界",
      displayText: "你好世界",
      sourceText: "hello world",
      captureStrategy: "before-caret-first",
      targetApp: expect.objectContaining({
        processName: "notepad.exe",
      }),
      openResultWindowOnFailure: true,
    });
    expect(store.activeSessionId).toBeNull();
  });

  it("cancels a repeated double-alt request while the same source text is still translating", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const deferred = createDeferred<any>();
    mocked.runSystemInputTranslationSession.mockReturnValue(deferred.promise);

    const store = useSystemInputStore();
    await store.initialize();

    mocked.translationRequestListener?.(createTranslationRequestEvent());
    await flushPromises();
    mocked.translationRequestListener?.(createTranslationRequestEvent({
      sessionId: "session-2",
      emittedAt: "1710000000001",
    }));
    await flushPromises();

    expect(mocked.runSystemInputTranslationSession).toHaveBeenCalledTimes(1);
    expect(mocked.cancelSystemInputSession).toHaveBeenCalledWith({
      sessionId: "session-2",
    });

    deferred.resolve({
      requestEvent: createTranslationRequestEvent(),
      request: {
        sourceText: "hello world",
        sourceLanguage: "auto",
        targetLanguage: "English",
      },
      result: {
        text: "你好世界",
        model: "gpt-4o-mini",
        provider: "openai-compatible",
        raw: null,
      },
      modelName: "Default Model",
      writeback: {
        sessionId: "session-1",
        success: true,
        usedStrategy: "native-replace",
        fallbackWindowRequired: false,
        error: null,
      },
    });
    await flushPromises();

    expect(store.activeSessionId).toBeNull();
  });

  it("retranslates double-alt requests when the translation context changes", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    mocked.runSystemInputTranslationSession
      .mockResolvedValueOnce({
        requestEvent: createTranslationRequestEvent(),
        request: {
          sourceText: "hello world",
          sourceLanguage: "auto",
          targetLanguage: "English",
        },
        result: {
          text: "你好世界",
          model: "gpt-4o-mini",
          provider: "openai-compatible",
          raw: null,
        },
        modelName: "Default Model",
        writeback: {
          sessionId: "session-1",
          success: true,
          usedStrategy: "native-replace",
          fallbackWindowRequired: false,
          error: null,
        },
      })
      .mockResolvedValueOnce({
        requestEvent: createTranslationRequestEvent({
          sessionId: "session-2",
          targetLanguage: "Japanese",
          emittedAt: "1710000000001",
        }),
        request: {
          sourceText: "hello world",
          sourceLanguage: "auto",
          targetLanguage: "Japanese",
        },
        result: {
          text: "こんにちは世界",
          model: "gpt-4o-mini",
          provider: "openai-compatible",
          raw: null,
        },
        modelName: "Default Model",
        writeback: {
          sessionId: "session-2",
          success: true,
          usedStrategy: "native-replace",
          fallbackWindowRequired: false,
          error: null,
        },
      });

    const store = useSystemInputStore();
    await store.initialize();

    mocked.translationRequestListener?.(createTranslationRequestEvent());
    await flushPromises();
    mocked.translationRequestListener?.(createTranslationRequestEvent({
      sessionId: "session-2",
      targetLanguage: "Japanese",
      emittedAt: "1710000000001",
    }));
    await flushPromises();

    expect(mocked.runSystemInputTranslationSession).toHaveBeenCalledTimes(2);
    expect(mocked.submitSystemInputTranslation).not.toHaveBeenCalled();
    expect(store.activeSessionId).toBeNull();
  });

  it("syncs system input config changes back to native", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const store = useSystemInputStore();
    await store.initialize();

    mocked.updateSystemInputNativeConfig.mockClear();
    mocked.appConfigStore.preferences.systemInput.onlyWhenEnglishText = false;
    await nextTick();
    await flushPromises();

    expect(mocked.updateSystemInputNativeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        onlyWhenEnglishText: false,
      }),
    );
    expect(store.syncing).toBe(false);
  });

  it("refreshes native status and exposes the last error", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const store = useSystemInputStore();

    mocked.getSystemInputNativeStatus.mockResolvedValueOnce({
      ...createDefaultSystemInputStatus(),
      nativeReady: true,
      active: false,
      platform: "windows",
      permissionState: "not-required",
      lastError: "native status error",
    });

    await store.refreshStatusFromNative();

    expect(store.status.lastError).toBe("native status error");
    expect(store.lastError).toBe("native status error");
  });

  it("translates selected text from the fixed shortcut and stores the last translation", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const store = useSystemInputStore();
    await store.initialize();

    mocked.appConfigStore.preferences.systemInput.enabled = true;
    mocked.captureSystemSelectedTextWithContext.mockResolvedValue({
      text: "hello world",
      targetApp: {
        processId: 1234,
        processName: "notepad.exe",
        windowHandle: "0x1234",
        windowTitle: "记事本",
      },
    });
    mocked.appConfigStore.preferences.systemInput.replaceSelectionOnShortcutTranslate = false;
    mocked.translationStore.translateDetached.mockResolvedValue({
      text: "你好世界",
      model: "gpt-4o-mini",
      provider: "openai-compatible",
      raw: null,
    });

    await store.translateSelectedTextFromShortcut();

    expect(mocked.captureSystemSelectedTextWithContext).toHaveBeenCalledTimes(1);
    expect(mocked.translationStore.translateDetached).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceText: "hello world",
        sourceLanguage: "auto",
        targetLanguage: "Chinese (Simplified)",
      }),
      mocked.appConfigStore.selectedTranslationModel,
    );
    expect(store.lastShortcutTranslation).toBe("你好世界");
    expect(mocked.showSystemInputNotification).toHaveBeenCalledWith(
      "选中文本翻译完成",
      "已生成译文，按 Ctrl+3 粘贴。",
    );
  });

  it("surfaces the auto target decision in shortcut notifications", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const store = useSystemInputStore();
    await store.initialize();

    mocked.appConfigStore.preferences.systemInput.enabled = true;
    mocked.appConfigStore.preferences.systemInput.targetLanguage = "auto";
    mocked.appConfigStore.preferences.systemInput.replaceSelectionOnShortcutTranslate = false;
    mocked.captureSystemSelectedTextWithContext.mockResolvedValue({
      text: "hello world",
      targetApp: {
        processId: 1234,
        processName: "notepad.exe",
        windowHandle: "0x1234",
        windowTitle: "记事本",
      },
    });
    mocked.translationStore.resolveRequest.mockResolvedValue({
      sourceText: "hello world",
      sourceLanguage: "English",
      targetLanguage: "Chinese (Simplified)",
      sourceImage: null,
      resolution: {
        requestedSourceLanguage: "auto",
        requestedTargetLanguage: "auto",
        resolvedSourceLanguage: "English",
        resolvedTargetLanguage: "Chinese (Simplified)",
        systemLanguage: "Chinese (Simplified)",
        systemLocale: "zh-CN",
        sourceLanguageCode: "en",
        targetLanguageCode: "zh",
        usedAutoTarget: true,
        reason: "source-differs-from-system",
        detection: {
          language: "en",
          confidence: 0.97,
          reliable: true,
          isMixed: false,
          strategy: "model",
        },
      },
    });
    mocked.translationStore.translateDetached.mockResolvedValue({
      text: "你好世界",
      model: "gpt-4o-mini",
      provider: "openai-compatible",
      raw: null,
    });

    await store.translateSelectedTextFromShortcut();

    expect(mocked.showSystemInputNotification).toHaveBeenCalledWith(
      "选中文本翻译完成",
      "检测到English，已自动翻译为简体中文。 已生成译文，按 Ctrl+3 粘贴。",
    );
  });

  it("skips repeated clipboard shortcut requests when the source text is unchanged", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const store = useSystemInputStore();
    await store.initialize();

    mocked.appConfigStore.preferences.systemInput.enabled = true;
    mocked.readSystemClipboardText.mockResolvedValue("hello world");
    mocked.translationStore.translateDetached.mockResolvedValue({
      text: "你好世界",
      model: "gpt-4o-mini",
      provider: "openai-compatible",
      raw: null,
    });

    await store.translateClipboardTextFromShortcut();
    await store.translateClipboardTextFromShortcut();

    expect(mocked.translationStore.translateDetached).toHaveBeenCalledTimes(1);
    expect(store.lastShortcutTranslation).toBe("你好世界");
    expect(mocked.showSystemInputNotification).toHaveBeenLastCalledWith(
      "已跳过重复翻译",
      "源内容未变化，继续使用上次译文。按 Ctrl+3 粘贴。",
    );
  });

  it("retranslates unchanged text when the shortcut translation context changes", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const store = useSystemInputStore();
    await store.initialize();

    mocked.appConfigStore.preferences.systemInput.enabled = true;
    mocked.readSystemClipboardText.mockResolvedValue("hello world");
    mocked.translationStore.translateDetached
      .mockResolvedValueOnce({
        text: "你好世界",
        model: "gpt-4o-mini",
        provider: "openai-compatible",
        raw: null,
      })
      .mockResolvedValueOnce({
        text: "こんにちは世界",
        model: "gpt-4o-mini",
        provider: "openai-compatible",
        raw: null,
      });

    await store.translateClipboardTextFromShortcut();
    mocked.appConfigStore.preferences.systemInput.targetLanguage = "Japanese";
    await store.translateClipboardTextFromShortcut();

    expect(mocked.translationStore.translateDetached).toHaveBeenCalledTimes(2);
    expect(mocked.translationStore.translateDetached).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sourceText: "hello world",
        targetLanguage: "Japanese",
      }),
      mocked.appConfigStore.selectedTranslationModel,
    );
    expect(store.lastShortcutTranslation).toBe("こんにちは世界");
  });

  it("replaces the original selection after Ctrl+1 translation when enabled", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const store = useSystemInputStore();
    await store.initialize();

    mocked.appConfigStore.preferences.systemInput.enabled = true;
    mocked.appConfigStore.preferences.systemInput.replaceSelectionOnShortcutTranslate = true;
    mocked.captureSystemSelectedTextWithContext.mockResolvedValue({
      text: "hello world",
      targetApp: {
        processId: 1234,
        processName: "notepad.exe",
        windowHandle: "0x1234",
        windowTitle: "记事本",
      },
    });
    mocked.translationStore.translateDetached.mockResolvedValue({
      text: "你好世界",
      model: "gpt-4o-mini",
      provider: "openai-compatible",
      raw: null,
    });

    await store.translateSelectedTextFromShortcut();

    expect(mocked.pasteSystemInputText).toHaveBeenCalledWith(
      "你好世界",
      expect.objectContaining({
        processId: 1234,
        processName: "notepad.exe",
      }),
    );
    expect(mocked.showSystemInputNotification).toHaveBeenCalledWith(
      "选中文本已翻译并覆盖原文",
      "译文已保存，按 Ctrl+3 可再次粘贴。",
    );
  });

  it("keeps the translation and shows a manual paste hint when auto replace fails", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const store = useSystemInputStore();
    await store.initialize();

    mocked.appConfigStore.preferences.systemInput.enabled = true;
    mocked.appConfigStore.preferences.systemInput.replaceSelectionOnShortcutTranslate = true;
    mocked.appConfigStore.preferences.systemInput.pasteLastTranslationShortcut = "Alt+3";
    mocked.captureSystemSelectedTextWithContext.mockResolvedValue({
      text: "hello world",
      targetApp: {
        processId: 1234,
        processName: "notepad.exe",
        windowHandle: "0x1234",
        windowTitle: "记事本",
      },
    });
    mocked.translationStore.translateDetached.mockResolvedValue({
      text: "你好世界",
      model: "gpt-4o-mini",
      provider: "openai-compatible",
      raw: null,
    });
    mocked.pasteSystemInputText.mockResolvedValue(false);

    await store.translateSelectedTextFromShortcut();

    expect(store.lastShortcutTranslation).toBe("你好世界");
    expect(store.lastWritebackError).toBe("翻译完成，但自动覆盖原文失败。");
    expect(mocked.showSystemInputNotification).toHaveBeenCalledWith(
      "翻译完成，但自动覆盖失败",
      "可按 Alt+3 手动粘贴译文。",
    );
  });

  it("pastes the last translated text from the fixed shortcut", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const store = useSystemInputStore();
    await store.initialize();

    mocked.appConfigStore.preferences.systemInput.enabled = true;
    store.lastShortcutTranslation = "已生成的译文";

    await store.pasteLastTranslationFromShortcut();

    expect(mocked.pasteSystemInputText).toHaveBeenCalledWith("已生成的译文");
    expect(mocked.showSystemInputNotification).toHaveBeenCalledWith("已粘贴译文", undefined);
  });

  it("uses the customized toggle shortcut in disabled-state notifications", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const store = useSystemInputStore();
    await store.initialize();

    mocked.appConfigStore.preferences.systemInput.enabled = false;
    mocked.appConfigStore.preferences.systemInput.toggleEnabledShortcut = "Alt+0";

    const result = await store.translateClipboardTextFromShortcut();

    expect(result).toBe(false);
    expect(mocked.showSystemInputNotification).toHaveBeenCalledWith(
      "系统输入增强已关闭",
      "按 Alt+0 可以重新开启。",
    );
  });

  it("toggles system input enabled from the fixed shortcut", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const store = useSystemInputStore();
    await store.initialize();

    mocked.updateSystemInputNativeConfig.mockClear();
    mocked.appConfigStore.updateSystemInputConfig.mockClear();
    mocked.appConfigStore.preferences.systemInput.enabled = false;

    const nextEnabled = await store.toggleEnabledFromShortcut();

    expect(nextEnabled).toBe(true);
    expect(mocked.appConfigStore.updateSystemInputConfig).toHaveBeenCalledWith({
      enabled: true,
    });
    expect(mocked.updateSystemInputNativeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
      }),
    );
    expect(mocked.showSystemInputNotification).toHaveBeenCalledWith(
      "系统输入增强已开启",
      "Ctrl+1 选中翻译，Ctrl+2 剪贴板翻译，Ctrl+3 粘贴译文。",
    );
  });

  it("shows the current target language on the first Ctrl+~ press", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const store = useSystemInputStore();
    await store.initialize();

    mocked.appConfigStore.preferences.systemInput.targetLanguage = "English";
    mocked.showSystemInputTargetLanguageOverlay.mockClear();
    mocked.appConfigStore.updateSystemInputConfig.mockClear();

    const nextTargetLanguage = await store.previewOrCycleTargetLanguageFromShortcut();

    expect(nextTargetLanguage).toBe("English");
    expect(mocked.beginSystemInputTargetLanguageOverlaySession).toHaveBeenCalledTimes(1);
    expect(mocked.appConfigStore.updateSystemInputConfig).not.toHaveBeenCalledWith({
      targetLanguage: "Japanese",
    });
    expect(mocked.showSystemInputTargetLanguageOverlay).toHaveBeenCalledWith({
      value: "English",
      label: "English",
      shortcutLabel: "Ctrl+~",
    });
  });

  it("switches to the next target language on the second Ctrl+~ press", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const store = useSystemInputStore();
    await store.initialize();

    mocked.hasSystemInputTargetLanguageOverlaySession.mockReturnValue(true);
    mocked.appConfigStore.preferences.systemInput.targetLanguage = "English";
    mocked.showSystemInputTargetLanguageOverlay.mockClear();
    mocked.appConfigStore.updateSystemInputConfig.mockClear();

    const nextTargetLanguage = await store.previewOrCycleTargetLanguageFromShortcut();

    expect(nextTargetLanguage).toBe("Japanese");
    expect(mocked.appConfigStore.updateSystemInputConfig).toHaveBeenCalledWith({
      targetLanguage: "Japanese",
    });
    expect(mocked.showSystemInputTargetLanguageOverlay).toHaveBeenCalledWith({
      value: "Japanese",
      label: "日本語",
      shortcutLabel: "Ctrl+~",
    });
  });
});
