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
  ocrStore: null as any,
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

vi.mock("@/stores/ocr", () => ({
  useOcrStore: () => mocked.ocrStore,
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
    setup(_, { attrs, slots, emit }) {
      return () =>
        h(
          tag,
          typeof attrs["data-testid"] === "string"
            ? {
              "data-testid": attrs["data-testid"],
              onClick: () => emit("click"),
            }
            : { onClick: () => emit("click") },
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
    updateSystemInputConfig: vi.fn(async () => {}),
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

  mocked.ocrStore = reactive({
    statuses: [
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
    ],
    initialize: vi.fn(async () => {}),
    downloadEngine: vi.fn(async () => {}),
    getStatus: vi.fn((engineId: string) =>
      mocked.ocrStore.statuses.find((item: { engineId: string }) => item.engineId === engineId) ?? null,
    ),
  });
}

function mountPage() {
  return shallowMount(AppSettingsPage, {
    global: {
      stubs: {
        NAlert: createControlStub("NAlert"),
        NButton: createControlStub("NButton", "button", ["click"]),
        NInputNumber: createControlStub("NInputNumber"),
        NProgress: createControlStub("NProgress"),
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

describe("AppSettingsPage OCR settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createStores();
  });

  it("updates the preferred OCR engine", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await emitValue(wrapper, "ocr-engine-select", "paddleocr");

    expect(mocked.appConfigStore.updateTranslationPreferences).toHaveBeenCalledWith({
      ocrEngine: "paddleocr",
    });
  });

  it("starts OCR engine download when the install button is clicked", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('[data-testid="download-paddleocr"]').trigger("click");

    expect(mocked.ocrStore.downloadEngine).toHaveBeenCalledWith("paddleocr");
  });
});
