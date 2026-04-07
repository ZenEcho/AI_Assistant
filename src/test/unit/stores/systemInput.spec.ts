import { flushPromises } from "@vue/test-utils";
import { nextTick, reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPreferences } from "@/constants/app";
import { createDefaultSystemInputStatus } from "@/types/systemInput";

const mocked = vi.hoisted(() => ({
  appConfigStore: null as any,
  translationStore: null as any,
  hasSystemInputTargetLanguageOverlaySession: vi.fn(() => false),
  beginSystemInputTargetLanguageOverlaySession: vi.fn(),
  clearSystemInputTargetLanguageOverlaySession: vi.fn(),
  isSystemInputTargetLanguageOverlayActive: vi.fn(async () => false),
  showSystemInputTargetLanguageOverlay: vi.fn(async () => null),
  initializeSystemInputNative: vi.fn(),
  updateSystemInputNativeConfig: vi.fn(),
  getSystemInputNativeStatus: vi.fn(),
  captureSystemSelectedText: vi.fn(),
  readSystemClipboardText: vi.fn(),
  pasteSystemInputText: vi.fn(),
  showSystemInputNotification: vi.fn(),
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
  showSystemInputTargetLanguageOverlay: mocked.showSystemInputTargetLanguageOverlay,
}));

vi.mock("@/services/systemInput/nativeBridge", () => ({
  initializeSystemInputNative: mocked.initializeSystemInputNative,
  updateSystemInputNativeConfig: mocked.updateSystemInputNativeConfig,
  getSystemInputNativeStatus: mocked.getSystemInputNativeStatus,
  captureSystemSelectedText: mocked.captureSystemSelectedText,
  readSystemClipboardText: mocked.readSystemClipboardText,
  pasteSystemInputText: mocked.pasteSystemInputText,
}));

vi.mock("@/services/systemInput/systemNotification", () => ({
  showSystemInputNotification: mocked.showSystemInputNotification,
}));

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
    updateTranslationPreferences: vi.fn(async (patch: Record<string, unknown>) => {
      Object.assign(mocked.appConfigStore.preferences.translation, patch);
    }),
    updateSystemInputConfig: vi.fn(async (patch: Record<string, unknown>) => {
      Object.assign(mocked.appConfigStore.preferences.systemInput, patch);
    }),
  });

  mocked.translationStore = reactive({
    resolveRequest: vi.fn(async (request) => request),
    translateDetached: vi.fn(),
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
      active: false,
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
    mocked.readSystemClipboardText.mockResolvedValue(null);
    mocked.pasteSystemInputText.mockResolvedValue(true);
    mocked.showSystemInputNotification.mockResolvedValue(true);
  });

  it("syncs shortcut input config changes back to native", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const store = useSystemInputStore();
    await store.initialize();

    mocked.updateSystemInputNativeConfig.mockClear();
    mocked.appConfigStore.preferences.systemInput.targetLanguageSwitchShortcut = "Alt+L";
    await nextTick();
    await flushPromises();

    expect(mocked.updateSystemInputNativeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        targetLanguageSwitchShortcut: "Alt+L",
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

  it("translates selected text from Ctrl+1 and stores the last translation", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const store = useSystemInputStore();
    await store.initialize();

    mocked.appConfigStore.preferences.systemInput.enabled = true;
    mocked.captureSystemSelectedText.mockResolvedValue("hello world");
    mocked.translationStore.translateDetached.mockResolvedValue({
      text: "translated text",
      model: "gpt-4o-mini",
      provider: "openai-compatible",
      raw: null,
    });

    await store.translateSelectedTextFromShortcut();

    expect(mocked.captureSystemSelectedText).toHaveBeenCalledTimes(1);
    expect(mocked.translationStore.translateDetached).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceText: "hello world",
        sourceLanguage: "auto",
        targetLanguage: "English",
      }),
      mocked.appConfigStore.selectedTranslationModel,
    );
    expect(store.lastShortcutTranslation).toBe("translated text");
    expect(mocked.pasteSystemInputText).not.toHaveBeenCalled();
    expect(mocked.showSystemInputNotification).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("Ctrl+3"),
    );
  });

  it("surfaces the auto target decision in shortcut notifications", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const store = useSystemInputStore();
    await store.initialize();

    mocked.appConfigStore.preferences.systemInput.enabled = true;
    mocked.appConfigStore.preferences.translation.targetLanguage = "auto";
    mocked.captureSystemSelectedText.mockResolvedValue("hello world");
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
        reason: "system-language-target",
        detection: null,
      },
    });
    mocked.translationStore.translateDetached.mockResolvedValue({
      text: "translated text",
      model: "gpt-4o-mini",
      provider: "openai-compatible",
      raw: null,
    });

    await store.translateSelectedTextFromShortcut();

    expect(mocked.showSystemInputNotification).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("Auto target resolved to 简体中文"),
    );
  });

  it("skips repeated clipboard shortcut requests when the source text is unchanged", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const store = useSystemInputStore();
    await store.initialize();

    mocked.appConfigStore.preferences.systemInput.enabled = true;
    mocked.readSystemClipboardText.mockResolvedValue("hello world");
    mocked.translationStore.translateDetached.mockResolvedValue({
      text: "translated text",
      model: "gpt-4o-mini",
      provider: "openai-compatible",
      raw: null,
    });

    await store.translateClipboardTextFromShortcut();
    await store.translateClipboardTextFromShortcut();

    expect(mocked.translationStore.translateDetached).toHaveBeenCalledTimes(1);
    expect(store.lastShortcutTranslation).toBe("translated text");
    expect(mocked.showSystemInputNotification).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.stringContaining("Ctrl+3"),
    );
  });

  it("pastes the last translated text from Ctrl+3", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const store = useSystemInputStore();
    await store.initialize();

    mocked.appConfigStore.preferences.systemInput.enabled = true;
    store.lastShortcutTranslation = "translated text";

    await store.pasteLastTranslationFromShortcut();

    expect(mocked.pasteSystemInputText).toHaveBeenCalledWith("translated text");
    expect(mocked.showSystemInputNotification).toHaveBeenCalledWith(expect.any(String), undefined);
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
      expect.any(String),
      expect.stringContaining("Alt+0"),
    );
  });

  it("toggles shortcut input enabled from Ctrl+4", async () => {
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
      expect.any(String),
      expect.stringContaining("Ctrl+1"),
    );
  });

  it("shows the current shared target language on the first switch-shortcut press", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const store = useSystemInputStore();
    await store.initialize();

    mocked.appConfigStore.preferences.translation.targetLanguage = "English";
    mocked.appConfigStore.preferences.systemInput.targetLanguageSwitchShortcut = "Alt+L";
    mocked.showSystemInputTargetLanguageOverlay.mockClear();
    mocked.appConfigStore.updateTranslationPreferences.mockClear();

    const nextTargetLanguage = await store.previewOrCycleTargetLanguageFromShortcut();

    expect(nextTargetLanguage).toBe("English");
    expect(mocked.beginSystemInputTargetLanguageOverlaySession).toHaveBeenCalledTimes(1);
    expect(mocked.appConfigStore.updateTranslationPreferences).not.toHaveBeenCalledWith({
      targetLanguage: "Japanese",
    });
    expect(mocked.showSystemInputTargetLanguageOverlay).toHaveBeenCalledWith({
      value: "English",
      label: "English",
      shortcutLabel: "Alt+L",
    });
  });

  it("switches to the next shared target language on the second switch-shortcut press", async () => {
    const { useSystemInputStore } = await import("@/stores/systemInput");
    const store = useSystemInputStore();
    await store.initialize();

    mocked.hasSystemInputTargetLanguageOverlaySession.mockReturnValue(true);
    mocked.appConfigStore.preferences.translation.targetLanguage = "English";
    mocked.showSystemInputTargetLanguageOverlay.mockClear();
    mocked.appConfigStore.updateTranslationPreferences.mockClear();

    const nextTargetLanguage = await store.previewOrCycleTargetLanguageFromShortcut();

    expect(nextTargetLanguage).toBe("Japanese");
    expect(mocked.appConfigStore.updateTranslationPreferences).toHaveBeenCalledWith({
      targetLanguage: "Japanese",
    });
    expect(mocked.showSystemInputTargetLanguageOverlay).toHaveBeenCalledWith({
      value: "Japanese",
      label: "日本語",
      shortcutLabel: "Ctrl+~",
    });
  });
});
