import { defineComponent, h, nextTick, reactive } from "vue";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPreferences } from "@/constants/app";
import AppLifecycleController from "@/components/app/AppLifecycleController.vue";

const mocked = vi.hoisted(() => {
  const unlistenCloseRequested = vi.fn();
  const appWindow = {
    label: "main",
    show: vi.fn(async () => {}),
    unminimize: vi.fn(async () => {}),
    setFocus: vi.fn(async () => {}),
    hide: vi.fn(async () => {}),
    onCloseRequested: vi.fn(async () => unlistenCloseRequested),
    setIcon: vi.fn(async () => {}),
  };

  return {
    message: {
      error: vi.fn(),
    },
    appConfigStore: null as any,
    systemInputStore: null as any,
    registerGlobalShortcut: vi.fn(async () => ({ success: true, conflict: false })),
    registerNamedShortcut: vi.fn(async () => ({ success: true, conflict: false })),
    unregisterAllShortcuts: vi.fn(async () => {}),
    defaultWindowIcon: vi.fn(async () => null),
    getName: vi.fn(async () => "AI Assistant"),
    invoke: vi.fn(async () => {}),
    isTauri: vi.fn(() => true),
    imageFromBytes: vi.fn(async () => ({ rgba: [] })),
    createMenu: vi.fn(async () => ({ id: "tray-menu" })),
    createTray: vi.fn(async () => ({ id: "main-tray" })),
    prewarmSystemInputTargetLanguageOverlayWindow: vi.fn(async () => null),
    appWindow,
    unlistenCloseRequested,
  };
});

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

vi.mock("@tauri-apps/api/app", () => ({
  defaultWindowIcon: mocked.defaultWindowIcon,
  getName: mocked.getName,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
  isTauri: mocked.isTauri,
}));

vi.mock("@tauri-apps/api/image", () => ({
  Image: {
    fromBytes: mocked.imageFromBytes,
  },
}));

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: {
    new: mocked.createMenu,
  },
}));

vi.mock("@tauri-apps/api/tray", () => ({
  TrayIcon: {
    new: mocked.createTray,
  },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => mocked.appWindow,
}));

vi.mock("naive-ui", async () => {
  const actual = await vi.importActual<typeof import("naive-ui")>("naive-ui");
  return {
    ...actual,
    useMessage: () => mocked.message,
  };
});

vi.mock("@/stores/appConfig", () => ({
  useAppConfigStore: () => mocked.appConfigStore,
}));

vi.mock("@/stores/systemInput", () => ({
  useSystemInputStore: () => mocked.systemInputStore,
}));

vi.mock("@/services/shortcut/globalShortcutService", () => ({
  registerGlobalShortcut: mocked.registerGlobalShortcut,
  registerNamedShortcut: mocked.registerNamedShortcut,
  unregisterAllShortcuts: mocked.unregisterAllShortcuts,
}));

vi.mock("@/services/window/windowManager", () => ({
  prewarmSystemInputTargetLanguageOverlayWindow:
    mocked.prewarmSystemInputTargetLanguageOverlayWindow,
}));

function createControlStub(name: string, tag = "div", emits: string[] = ["click"]) {
  return defineComponent({
    name,
    inheritAttrs: false,
    emits,
    setup(_, { slots }) {
      return () => h(tag, slots.default?.());
    },
  });
}

function createStores() {
  const preferences = createDefaultPreferences();
  preferences.globalShortcut = "Alt+Q";
  preferences.systemInput.translateSelectionShortcut = "Ctrl+Shift+1";
  preferences.systemInput.translateClipboardShortcut = "Ctrl+Shift+2";
  preferences.systemInput.pasteLastTranslationShortcut = "Ctrl+Shift+3";
  preferences.systemInput.toggleEnabledShortcut = "Ctrl+Shift+4";

  mocked.appConfigStore = reactive({
    preferences,
    setCloseBehavior: vi.fn(async () => {}),
  });

  mocked.systemInputStore = reactive({
    initialize: vi.fn(async () => {}),
    previewOrCycleTargetLanguageFromShortcut: vi.fn(async () => "English"),
    translateSelectedTextFromShortcut: vi.fn(async () => true),
    translateClipboardTextFromShortcut: vi.fn(async () => true),
    pasteLastTranslationFromShortcut: vi.fn(async () => true),
    toggleEnabledFromShortcut: vi.fn(async () => true),
    dispose: vi.fn(),
  });
}

function mountComponent() {
  return shallowMount(AppLifecycleController, {
    global: {
      stubs: {
        NButton: createControlStub("NButton", "button"),
        NCheckbox: createControlStub("NCheckbox"),
        NModal: createControlStub("NModal"),
        NRadio: createControlStub("NRadio"),
        NText: createControlStub("NText"),
      },
    },
  });
}

describe("AppLifecycleController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createStores();
    mocked.isTauri.mockReturnValue(true);
    mocked.imageFromBytes.mockResolvedValue({ rgba: [] });
    mocked.createMenu.mockResolvedValue({ id: "tray-menu" });
    mocked.createTray.mockResolvedValue({ id: "main-tray" });
    mocked.appWindow.onCloseRequested.mockResolvedValue(mocked.unlistenCloseRequested);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );
  });

  it("registers the main shortcut, the fixed language switcher, and all configurable system input shortcuts on mount", async () => {
    mountComponent();
    await flushPromises();

    expect(mocked.systemInputStore.initialize).toHaveBeenCalledTimes(1);
    expect(mocked.prewarmSystemInputTargetLanguageOverlayWindow).toHaveBeenCalledTimes(1);
    expect(mocked.registerGlobalShortcut).toHaveBeenCalledWith("Alt+Q");
    expect(
      (mocked.registerNamedShortcut.mock.calls as unknown as Array<[string, string]>).map((call) => [
        call[0],
        call[1],
      ]),
    ).toEqual([
      ["system-input-target-language-overlay", "Ctrl+`"],
      ["system-input-translate-selection", "Ctrl+Shift+1"],
      ["system-input-translate-clipboard", "Ctrl+Shift+2"],
      ["system-input-paste-last-translation", "Ctrl+Shift+3"],
      ["system-input-toggle-enabled", "Ctrl+Shift+4"],
    ]);
  });

  it("re-registers all system input shortcuts when a configured shortcut changes", async () => {
    mountComponent();
    await flushPromises();

    mocked.registerNamedShortcut.mockClear();
    mocked.appConfigStore.preferences.systemInput.translateClipboardShortcut = "Alt+2";
    await nextTick();
    await flushPromises();

    expect(
      (mocked.registerNamedShortcut.mock.calls as unknown as Array<[string, string]>).map((call) => [
        call[0],
        call[1],
      ]),
    ).toEqual([
      ["system-input-translate-selection", "Ctrl+Shift+1"],
      ["system-input-translate-clipboard", "Alt+2"],
      ["system-input-paste-last-translation", "Ctrl+Shift+3"],
      ["system-input-toggle-enabled", "Ctrl+Shift+4"],
    ]);
  });

  it("disposes listeners and shortcuts on unmount", async () => {
    const wrapper = mountComponent();
    await flushPromises();

    wrapper.unmount();
    await flushPromises();

    expect(mocked.unlistenCloseRequested).toHaveBeenCalledTimes(1);
    expect(mocked.systemInputStore.dispose).toHaveBeenCalledTimes(1);
    expect(mocked.unregisterAllShortcuts).toHaveBeenCalledTimes(1);
  });
});
