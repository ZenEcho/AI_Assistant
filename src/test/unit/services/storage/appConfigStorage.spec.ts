import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultPreferences,
  createDefaultSystemInputConfig,
  SYSTEM_INPUT_ACTION_SHORTCUTS,
} from "@/constants/app";

const mocked = vi.hoisted(() => ({
  load: vi.fn(),
  store: {
    get: vi.fn(),
    set: vi.fn(),
    save: vi.fn(),
  },
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  load: mocked.load,
}));

async function importStorageModule() {
  vi.resetModules();
  return await import("@/services/storage/appConfigStorage");
}

describe("appConfigStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.load.mockResolvedValue(mocked.store);
  });

  it("persists a default config when storage is empty", async () => {
    mocked.store.get.mockResolvedValue(null);

    const { loadAppConfig } = await importStorageModule();
    const result = await loadAppConfig();

    expect(result.preferences).toEqual(createDefaultPreferences());
    expect(result.models).toEqual([]);
    expect(mocked.load).toHaveBeenCalledWith(
      "app-config.json",
      expect.objectContaining({
        autoSave: 200,
      }),
    );
    expect(mocked.store.set).toHaveBeenCalledWith(
      "app-config",
      expect.objectContaining({
        preferences: createDefaultPreferences(),
      }),
    );
    expect(mocked.store.save).toHaveBeenCalledTimes(1);
  });

  it("sanitizes persisted system input config and keeps custom shortcuts", async () => {
    mocked.store.get.mockResolvedValue({
      preferences: {
        themeMode: "unknown",
        locale: "fr-FR",
        closeBehavior: "exit",
        launchAtStartup: "yes",
        historyLimit: 0,
        globalShortcut: "   ",
        translateShortcut: "",
        selectedTranslationModelId: " selected-model ",
        systemInput: {
          enabled: "true",
          translateSelectionShortcut: "   ",
          translateClipboardShortcut: " Ctrl+Shift+2 ",
          pasteLastTranslationShortcut: "",
          toggleEnabledShortcut: " Alt+4 ",
          targetLanguageSwitchShortcut: " Alt+` ",
          sourceLanguage: "",
        },
      },
      models: [
        {
          id: "disabled-default",
          name: "Disabled Default",
          provider: "custom-provider",
          enabled: false,
          isDefault: true,
        },
        {
          id: "enabled-model",
          name: "Enabled Model",
          provider: "another-provider",
          enabled: true,
          isDefault: false,
          baseUrl: "https://example.com/v1",
          apiKey: "test-key",
          model: "gpt-4o-mini",
          systemPrompt: "translate",
          timeoutMs: 30_000,
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
        },
      ],
    });

    const { loadAppConfig } = await importStorageModule();
    const result = await loadAppConfig();

    expect(result.preferences.themeMode).toBe("auto");
    expect(result.preferences.locale).toBe("zh-CN");
    expect(result.preferences.closeBehavior).toBe("ask");
    expect(result.preferences.launchAtStartup).toBe(false);
    expect(result.preferences.historyLimit).toBe(1);
    expect(result.preferences.globalShortcut).toBe("Alt+Space");
    expect(result.preferences.translateShortcut).toBe("Ctrl+Enter");
    expect(result.preferences.selectedTranslationModelId).toBe("selected-model");

    expect(result.preferences.systemInput).toEqual(
      expect.objectContaining({
        enabled: false,
        translateSelectionShortcut: SYSTEM_INPUT_ACTION_SHORTCUTS.translateSelection,
        translateClipboardShortcut: "Ctrl+Shift+2",
        pasteLastTranslationShortcut: SYSTEM_INPUT_ACTION_SHORTCUTS.pasteLastTranslation,
        toggleEnabledShortcut: "Alt+4",
        targetLanguageSwitchShortcut: "Alt+`",
        sourceLanguage: createDefaultSystemInputConfig().sourceLanguage,
      }),
    );

    expect(result.models).toHaveLength(2);
    expect(result.models.every((model) => model.provider === "openai-compatible")).toBe(true);
    expect(result.models.find((model) => model.id === "enabled-model")?.isDefault).toBe(true);
    expect(mocked.store.set).toHaveBeenCalledWith("app-config", result);
    expect(mocked.store.save).toHaveBeenCalledTimes(1);
  });

  it("sanitizes configs before saving them", async () => {
    const { saveAppConfig } = await importStorageModule();

    await saveAppConfig({
      preferences: {
        ...createDefaultPreferences(),
        systemInput: {
          ...createDefaultSystemInputConfig(),
          translateSelectionShortcut: "  ",
          translateClipboardShortcut: " Alt+2 ",
          pasteLastTranslationShortcut: "",
          toggleEnabledShortcut: " Ctrl+0 ",
          targetLanguageSwitchShortcut: " Alt+` ",
        },
      },
      models: [
        {
          id: "model-1",
          name: "Model One",
          provider: "custom-provider",
          baseUrl: "https://example.com/v1",
          apiKey: "test-key",
          model: "gpt-4o-mini",
          enabled: true,
          isDefault: true,
          systemPrompt: "translate",
          timeoutMs: 30_000,
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
        },
      ],
    } as any);

    expect(mocked.store.set).toHaveBeenCalledWith(
      "app-config",
      expect.objectContaining({
        preferences: expect.objectContaining({
          systemInput: expect.objectContaining({
            translateSelectionShortcut: SYSTEM_INPUT_ACTION_SHORTCUTS.translateSelection,
            translateClipboardShortcut: "Alt+2",
            pasteLastTranslationShortcut: SYSTEM_INPUT_ACTION_SHORTCUTS.pasteLastTranslation,
            toggleEnabledShortcut: "Ctrl+0",
            targetLanguageSwitchShortcut: "Alt+`",
          }),
        }),
        models: [
          expect.objectContaining({
            id: "model-1",
            provider: "openai-compatible",
            isDefault: true,
          }),
        ],
      }),
    );
    expect(mocked.store.save).toHaveBeenCalledTimes(1);
  });
});
