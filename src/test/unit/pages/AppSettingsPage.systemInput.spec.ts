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
  dialog: {
    warning: vi.fn(),
  },
  appConfigStore: null as any,
  systemInputStore: null as any,
  translationStore: null as any,
  registerGlobalShortcut: vi.fn(async () => ({ success: true, conflict: false })),
  registerNamedShortcut: vi.fn(async () => ({ success: true, conflict: false })),
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
  resetSoftwareData: vi.fn(async () => {}),
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

vi.mock("@/services/app/resetService", () => ({
  resetSoftwareData: mocked.resetSoftwareData,
}));

vi.mock("naive-ui", async () => {
  const actual = await vi.importActual<typeof import("naive-ui")>("naive-ui");
  return {
    ...actual,
    useDialog: () => mocked.dialog,
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
    resetAppData: vi.fn(async () => {}),
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
    previewOrCycleTargetLanguageFromShortcut: vi.fn(async () => "English"),
    translateSelectedTextFromShortcut: vi.fn(async () => true),
    translateClipboardTextFromShortcut: vi.fn(async () => true),
    pasteLastTranslationFromShortcut: vi.fn(async () => true),
    toggleEnabledFromShortcut: vi.fn(async () => true),
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

describe("AppSettingsPage system input settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createStores();
  });

  it("updates the shared target language from the quick-input section", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await emitValue(wrapper, "system-input-target-language", "English");

    expect(mocked.appConfigStore.updateTranslationPreferences).toHaveBeenCalledWith({
      targetLanguage: "English",
    });
    expect(mocked.systemInputStore.syncConfigToNative).not.toHaveBeenCalled();
  });

  it("updates default translation target language", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await emitValue(wrapper, "system-input-target-language", "auto");

    expect(mocked.appConfigStore.updateTranslationPreferences).toHaveBeenCalledWith({
      targetLanguage: "auto",
    });
  });

  it("updates the quick-input enabled switch", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await emitValue(wrapper, "system-input-enabled", true);

    expect(mocked.appConfigStore.updateSystemInputConfig).toHaveBeenCalledWith({
      enabled: true,
    });
    expect(mocked.systemInputStore.syncConfigToNative).toHaveBeenCalledTimes(1);
  });

  it("records and applies a custom target-language switch shortcut", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper
      .get('[data-testid="system-input-shortcut-targetLanguageSwitchShortcut"]')
      .trigger("click");
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "l",
        altKey: true,
        bubbles: true,
      }),
    );
    await flushPromises();

    expect(mocked.registerNamedShortcut).toHaveBeenCalledWith(
      "system-input-target-language-overlay",
      "Alt+L",
      expect.any(Function),
    );
    expect(mocked.appConfigStore.updateSystemInputConfig).toHaveBeenCalledWith({
      targetLanguageSwitchShortcut: "Alt+L",
    });
    expect(mocked.systemInputStore.syncConfigToNative).toHaveBeenCalledTimes(1);
    expect(mocked.message.success).toHaveBeenCalledWith(expect.stringContaining("Alt+L"));
  });

  it("does not persist a system input shortcut when registration fails", async () => {
    mocked.registerNamedShortcut.mockResolvedValueOnce({
      success: false,
      conflict: false,
      error: "注册快捷键失败：系统调用失败",
    } as any);

    const wrapper = mountPage();
    await flushPromises();

    await wrapper
      .get('[data-testid="system-input-shortcut-translateClipboardShortcut"]')
      .trigger("click");
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "6",
        altKey: true,
        bubbles: true,
      }),
    );
    await flushPromises();

    expect(mocked.registerNamedShortcut).toHaveBeenCalledWith(
      "system-input-translate-clipboard",
      "Alt+6",
      expect.any(Function),
    );
    expect(mocked.appConfigStore.updateSystemInputConfig).not.toHaveBeenCalledWith({
      translateClipboardShortcut: "Alt+6",
    });
    expect(mocked.systemInputStore.syncConfigToNative).not.toHaveBeenCalled();
    expect(mocked.message.error).toHaveBeenCalledWith("注册快捷键失败：系统调用失败");
  });

  it("falls back to Alt when a Ctrl-based system input shortcut is occupied", async () => {
    mocked.registerNamedShortcut
      .mockResolvedValueOnce({
        success: false,
        conflict: true,
        error: "注册快捷键失败：该组合已被占用",
      } as any)
      .mockResolvedValueOnce({
        success: true,
        conflict: false,
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

    expect(mocked.registerNamedShortcut).toHaveBeenNthCalledWith(
      1,
      "system-input-translate-clipboard",
      "Ctrl+6",
      expect.any(Function),
    );
    expect(mocked.registerNamedShortcut).toHaveBeenNthCalledWith(
      2,
      "system-input-translate-clipboard",
      "Alt+6",
      expect.any(Function),
    );
    expect(mocked.appConfigStore.updateSystemInputConfig).toHaveBeenCalledWith({
      translateClipboardShortcut: "Alt+6",
    });
    expect(mocked.systemInputStore.syncConfigToNative).toHaveBeenCalledTimes(1);
    expect(mocked.message.warning).toHaveBeenCalledWith(expect.stringContaining("Alt+6"));
  });
});
