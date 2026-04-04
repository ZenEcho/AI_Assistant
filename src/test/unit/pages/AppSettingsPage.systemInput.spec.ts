import { defineComponent, h, reactive } from "vue";
import { flushPromises, shallowMount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPreferences } from "@/constants/app";
import { createDefaultSystemInputStatus } from "@/types/systemInput";
import AppSettingsPage from "@/pages/AppSettingsPage.vue";

const mocked = vi.hoisted(() => ({
  message: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
  appConfigStore: null as any,
  systemInputStore: null as any,
  translationStore: null as any,
  registerGlobalShortcut: vi.fn(async () => ({ success: true })),
  registerNamedShortcut: vi.fn(async () => ({ success: true })),
  openUrl: vi.fn(async () => {}),
  checkForGithubReleaseUpdate: vi.fn(async () => ({
    hasUpdate: false,
    currentVersion: "0.1.0",
    latestRelease: {
      version: "0.1.0",
      htmlUrl: "https://example.com/releases",
    },
  })),
  getCurrentAppVersion: vi.fn(async () => "0.1.0"),
}));

vi.mock("pinia", async () => {
  const actual = await vi.importActual<typeof import("pinia")>("pinia");
  const vue = await vi.importActual<typeof import("vue")>("vue");
  return {
    ...actual,
    storeToRefs(store: object) {
      return vue.toRefs(store as never);
    },
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => true),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: mocked.openUrl,
}));

vi.mock("@/stores/appConfig", () => ({
  useAppConfigStore: () => mocked.appConfigStore,
}));

vi.mock("@/stores/systemInput", () => ({
  useSystemInputStore: () => mocked.systemInputStore,
}));

vi.mock("@/stores/translation", () => ({
  useTranslationStore: () => mocked.translationStore,
}));

vi.mock("@/services/shortcut/globalShortcutService", () => ({
  registerGlobalShortcut: mocked.registerGlobalShortcut,
  registerNamedShortcut: mocked.registerNamedShortcut,
}));

vi.mock("@/services/app/updateService", () => ({
  GITHUB_RELEASES_URL: "https://example.com/releases",
  checkForGithubReleaseUpdate: mocked.checkForGithubReleaseUpdate,
  getCurrentAppVersion: mocked.getCurrentAppVersion,
}));

vi.mock("naive-ui", async () => {
  const actual = await vi.importActual<typeof import("naive-ui")>("naive-ui");
  return {
    ...actual,
    useMessage: () => mocked.message,
  };
});

function createControlStub(
  name: string,
  tag = "div",
  emits: string[] = ["update:value", "blur", "click"],
) {
  return defineComponent({
    name,
    inheritAttrs: false,
    emits,
    setup(_, { attrs, slots }) {
      return () =>
        h(
          tag,
          typeof attrs["data-testid"] === "string"
            ? { "data-testid": attrs["data-testid"] }
            : undefined,
          slots.default?.(),
        );
    },
  });
}

function createStores() {
  const preferences = createDefaultPreferences();

  mocked.appConfigStore = reactive({
    preferences,
    setThemeMode: vi.fn(async () => {}),
    setCloseBehavior: vi.fn(async () => {}),
    setLaunchAtStartup: vi.fn(async (value: boolean) => value),
    syncLaunchAtStartupPreference: vi.fn(async () => preferences.launchAtStartup),
    setHistoryLimit: vi.fn(async () => {}),
    clearHistory: vi.fn(async () => {}),
    resetPreferences: vi.fn(async () => {}),
    setGlobalShortcut: vi.fn(async () => {}),
    setTranslateShortcut: vi.fn(async () => {}),
    updateTranslationPreferences: vi.fn(async (partial: Record<string, unknown>) => {
      Object.assign(mocked.appConfigStore.preferences.translation, partial);
    }),
    updateSystemInputConfig: vi.fn(async (partial: Record<string, unknown>) => {
      Object.assign(mocked.appConfigStore.preferences.systemInput, partial);
    }),
  });

  mocked.systemInputStore = reactive({
    status: {
      ...createDefaultSystemInputStatus(),
      nativeReady: true,
      active: true,
      platform: "windows",
      permissionState: "not-required" as const,
    },
    lastError: "",
    lastWritebackError: "",
    syncConfigToNative: vi.fn(async () => {}),
    refreshStatusFromNative: vi.fn(async () => {}),
  });

  mocked.translationStore = reactive({
    history: [],
    clearHistory: vi.fn(async () => {}),
  });
}

function mountPage() {
  return shallowMount(AppSettingsPage, {
    global: {
      stubs: {
        NAlert: createControlStub("NAlert"),
        NButton: createControlStub("NButton", "button", ["click"]),
        NInput: createControlStub("NInput"),
        NInputNumber: createControlStub("NInputNumber"),
        NRadioGroup: createControlStub("NRadioGroup"),
        NRadioButton: createControlStub("NRadioButton"),
        NSelect: createControlStub("NSelect"),
        NSwitch: createControlStub("NSwitch"),
        NTag: createControlStub("NTag"),
      },
    },
  });
}

async function emitValue(wrapper: ReturnType<typeof mountPage>, testId: string, value: unknown) {
  const control = wrapper.getComponent(`[data-testid="${testId}"]`) as VueWrapper<any>;
  control.vm.$emit("update:value", value);
  await flushPromises();
}

async function emitBlur(wrapper: ReturnType<typeof mountPage>, testId: string) {
  const control = wrapper.getComponent(`[data-testid="${testId}"]`) as VueWrapper<any>;
  control.vm.$emit("blur");
  await flushPromises();
}

describe("AppSettingsPage system input settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createStores();
  });

  it("updates trigger mode for every trigger option", async () => {
    const wrapper = mountPage();
    await flushPromises();

    for (const triggerMode of ["double-space", "double-alt", "manual-hotkey"] as const) {
      mocked.appConfigStore.updateSystemInputConfig.mockClear();
      mocked.systemInputStore.syncConfigToNative.mockClear();

      await emitValue(wrapper, "system-input-trigger-mode", triggerMode);

      expect(mocked.appConfigStore.updateSystemInputConfig).toHaveBeenCalledWith({
        triggerMode,
      });
      expect(mocked.systemInputStore.syncConfigToNative).toHaveBeenCalledTimes(1);
    }
  });

  it("updates double tap interval", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await emitValue(wrapper, "system-input-double-tap-interval", 420);

    expect(mocked.appConfigStore.updateSystemInputConfig).toHaveBeenCalledWith({
      doubleTapIntervalMs: 420,
    });
    expect(mocked.systemInputStore.syncConfigToNative).toHaveBeenCalledTimes(1);
  });

  it("updates target language", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await emitValue(wrapper, "system-input-target-language", "English");

    expect(mocked.appConfigStore.updateSystemInputConfig).toHaveBeenCalledWith({
      targetLanguage: "English",
    });
    expect(mocked.systemInputStore.syncConfigToNative).toHaveBeenCalledTimes(1);
  });

  it("updates default translation target language", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await emitValue(wrapper, "translation-default-target-language", "auto");

    expect(mocked.appConfigStore.updateTranslationPreferences).toHaveBeenCalledWith({
      targetLanguage: "auto",
    });
  });

  it("updates capture mode for every capture option", async () => {
    const wrapper = mountPage();
    await flushPromises();

    for (const captureMode of [
      "before-caret-first",
      "selection-first",
      "whole-input-first",
    ] as const) {
      mocked.appConfigStore.updateSystemInputConfig.mockClear();
      mocked.systemInputStore.syncConfigToNative.mockClear();

      await emitValue(wrapper, "system-input-capture-mode", captureMode);

      expect(mocked.appConfigStore.updateSystemInputConfig).toHaveBeenCalledWith({
        captureMode,
      });
      expect(mocked.systemInputStore.syncConfigToNative).toHaveBeenCalledTimes(1);
    }
  });

  it("updates writeback mode for every writeback option", async () => {
    const wrapper = mountPage();
    await flushPromises();

    for (const writebackMode of [
      "auto",
      "native-replace",
      "simulate-input",
      "clipboard-paste",
      "popup-only",
    ] as const) {
      mocked.appConfigStore.updateSystemInputConfig.mockClear();
      mocked.systemInputStore.syncConfigToNative.mockClear();

      await emitValue(wrapper, "system-input-writeback-mode", writebackMode);

      expect(mocked.appConfigStore.updateSystemInputConfig).toHaveBeenCalledWith({
        writebackMode,
      });
      expect(mocked.systemInputStore.syncConfigToNative).toHaveBeenCalledTimes(1);
    }
  });

  it("updates every boolean system input switch", async () => {
    const wrapper = mountPage();
    await flushPromises();

    const cases = [
      ["system-input-enabled", { enabled: true }],
      ["system-input-only-selected-text", { onlySelectedText: true }],
      ["system-input-auto-replace", { autoReplace: false }],
      ["system-input-replace-selection-on-shortcut-translate", { replaceSelectionOnShortcutTranslate: false }],
      ["system-input-enable-clipboard-fallback", { enableClipboardFallback: false }],
      ["system-input-show-floating-hint", { showFloatingHint: false }],
      ["system-input-only-when-english-text", { onlyWhenEnglishText: false }],
      ["system-input-exclude-code-editors", { excludeCodeEditors: false }],
      ["system-input-debug-logging", { debugLogging: true }],
    ] as const;

    for (const [testId, expectedPatch] of cases) {
      mocked.appConfigStore.updateSystemInputConfig.mockClear();
      mocked.systemInputStore.syncConfigToNative.mockClear();

      await emitValue(wrapper, testId, Object.values(expectedPatch)[0]);

      expect(mocked.appConfigStore.updateSystemInputConfig).toHaveBeenCalledWith(expectedPatch);
      expect(mocked.systemInputStore.syncConfigToNative).toHaveBeenCalledTimes(1);
    }
  });

  it("parses blacklist text on blur", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await emitValue(wrapper, "system-input-blacklist", "notepad.exe\n code.exe \n\n");
    mocked.appConfigStore.updateSystemInputConfig.mockClear();
    mocked.systemInputStore.syncConfigToNative.mockClear();

    await emitBlur(wrapper, "system-input-blacklist");

    expect(mocked.appConfigStore.updateSystemInputConfig).toHaveBeenCalledWith({
      appBlacklist: ["notepad.exe", "code.exe"],
    });
    expect(mocked.systemInputStore.syncConfigToNative).toHaveBeenCalledTimes(1);
  });

  it("parses whitelist text on blur", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await emitValue(wrapper, "system-input-whitelist", "notepad.exe\n WINWORD.EXE \n");
    mocked.appConfigStore.updateSystemInputConfig.mockClear();
    mocked.systemInputStore.syncConfigToNative.mockClear();

    await emitBlur(wrapper, "system-input-whitelist");

    expect(mocked.appConfigStore.updateSystemInputConfig).toHaveBeenCalledWith({
      appWhitelist: ["notepad.exe", "WINWORD.EXE"],
    });
    expect(mocked.systemInputStore.syncConfigToNative).toHaveBeenCalledTimes(1);
  });

  it("records and applies a custom system input shortcut", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper
      .get('[data-testid="system-input-shortcut-translateSelectionShortcut"]')
      .trigger("click");
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "5",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    await flushPromises();

    expect(mocked.registerNamedShortcut).toHaveBeenCalledWith(
      "system-input-translate-selection",
      "Ctrl+5",
      expect.any(Function),
    );
    expect(mocked.appConfigStore.updateSystemInputConfig).toHaveBeenCalledWith({
      translateSelectionShortcut: "Ctrl+5",
    });
    expect(mocked.systemInputStore.syncConfigToNative).toHaveBeenCalledTimes(1);
    expect(mocked.message.success).toHaveBeenCalledWith("翻译选中内容 已设置为 Ctrl+5");
  });

  it("does not persist a system input shortcut when registration fails", async () => {
    mocked.registerNamedShortcut.mockResolvedValueOnce({
      success: false,
      conflict: true,
      error: "注册快捷键失败：该组合已被占用",
    } as any);

    const wrapper = mountPage();
    await flushPromises();

    await wrapper
      .get('[data-testid="system-input-shortcut-translateClipboardShortcut"]')
      .trigger("click");
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "6",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    await flushPromises();

    expect(mocked.registerNamedShortcut).toHaveBeenCalledWith(
      "system-input-translate-clipboard",
      "Ctrl+6",
      expect.any(Function),
    );
    expect(mocked.appConfigStore.updateSystemInputConfig).not.toHaveBeenCalledWith({
      translateClipboardShortcut: "Ctrl+6",
    });
    expect(mocked.systemInputStore.syncConfigToNative).not.toHaveBeenCalled();
    expect(mocked.message.error).toHaveBeenCalledWith("注册快捷键失败：该组合已被占用");
  });
});
