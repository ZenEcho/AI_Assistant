import { defineComponent, h, reactive } from "vue";
import { flushPromises, shallowMount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPreferences } from "@/constants/app";
import SystemInputTargetLanguageOverlayPage from "@/pages/SystemInputTargetLanguageOverlayPage.vue";

const mocked = vi.hoisted(() => {
  const appWindow = {
    label: "target-language-overlay",
    listen: vi.fn(),
    emitTo: vi.fn(async () => {}),
    hide: vi.fn(async () => {}),
    outerPosition: vi.fn(async () => ({ x: 100, y: 100 })),
    outerSize: vi.fn(async () => ({ width: 420, height: 248 })),
  };

  return {
    appWindow,
    appConfigStore: null as any,
    cursorPosition: vi.fn(async () => ({ x: 0, y: 0 })),
    syncListener:
      null as null | ((event: { payload: { value: string; label: string; shortcutLabel: string } }) => void),
  };
});

vi.mock("@tauri-apps/api/window", () => ({
  cursorPosition: mocked.cursorPosition,
  getCurrentWindow: () => mocked.appWindow,
}));

vi.mock("@/stores/appConfig", () => ({
  useAppConfigStore: () => mocked.appConfigStore,
}));

function createStores() {
  const preferences = createDefaultPreferences();
  preferences.translation.targetLanguage = "English";

  mocked.appConfigStore = reactive({
    initialized: true,
    preferences,
    initialize: vi.fn(async () => {
      mocked.appConfigStore.initialized = true;
    }),
    updateTranslationPreferences: vi.fn(async (partial: Record<string, unknown>) => {
      Object.assign(mocked.appConfigStore.preferences.translation, partial);
    }),
  });
}

function createControlStub(name: string, emits: string[] = ["update:value", "update:show"]) {
  return defineComponent({
    name,
    inheritAttrs: false,
    emits,
    setup(_, { attrs, slots }) {
      return () =>
        h(
          "div",
          typeof attrs["data-testid"] === "string"
            ? { "data-testid": attrs["data-testid"] }
            : undefined,
          slots.default?.(),
        );
    },
  });
}

function mountPage() {
  return shallowMount(SystemInputTargetLanguageOverlayPage, {
    global: {
      stubs: {
        NSelect: createControlStub("NSelect"),
      },
    },
  });
}

async function emitValue(wrapper: ReturnType<typeof mountPage>, testId: string, value: unknown) {
  const control = wrapper.getComponent(`[data-testid="${testId}"]`) as VueWrapper<any>;
  control.vm.$emit("update:value", value);
  await flushPromises();
}

describe("SystemInputTargetLanguageOverlayPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 16),
    );
    createStores();

    mocked.appWindow.listen.mockImplementation(async (_eventName, handler) => {
      mocked.syncListener = handler as (event: {
        payload: { value: string; label: string; shortcutLabel: string };
      }) => void;
      return () => {
        mocked.syncListener = null;
      };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("hides itself after 2 seconds when the mouse does not enter the window", async () => {
    mountPage();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(16);
    await flushPromises();

    expect(mocked.appWindow.emitTo).toHaveBeenCalledWith(
      "main",
      "system-input:target-language-overlay-ready",
    );

    await vi.advanceTimersByTimeAsync(1_999);
    await flushPromises();
    expect(mocked.appWindow.hide).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();

    expect(mocked.appWindow.emitTo).toHaveBeenCalledWith(
      "main",
      "system-input:target-language-overlay-closed",
    );
    expect(mocked.appWindow.hide).toHaveBeenCalledTimes(1);
  });

  it("keeps the overlay alive while the cursor is inside the window and updates the language from the menu", async () => {
    mocked.cursorPosition.mockResolvedValue({ x: 160, y: 160 });
    const wrapper = mountPage();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(16);
    await flushPromises();

    await vi.advanceTimersByTimeAsync(2_100);
    await flushPromises();
    expect(mocked.appWindow.hide).not.toHaveBeenCalled();

    await emitValue(wrapper, "target-language-overlay-select", "Japanese");

    expect(mocked.appConfigStore.updateTranslationPreferences).toHaveBeenCalledWith({
      targetLanguage: "Japanese",
    });
    expect(wrapper.get('[data-testid="target-language-overlay-label"]').text()).toBe("日本語");

    mocked.cursorPosition.mockResolvedValue({ x: 0, y: 0 });
    await vi.advanceTimersByTimeAsync(2_400);
    await flushPromises();

    expect(mocked.appWindow.hide).toHaveBeenCalledTimes(1);
  });

  it("refreshes the displayed language when a sync event arrives", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(16);
    await flushPromises();

    mocked.syncListener?.({
      payload: {
        value: "Chinese (Simplified)",
        label: "简体中文",
        shortcutLabel: "Ctrl+~",
      },
    });
    await flushPromises();

    expect(wrapper.get('[data-testid="target-language-overlay-label"]').text()).toBe("简体中文");
  });

  it("shows the auto mode description when auto target is selected", async () => {
    mocked.appConfigStore.preferences.translation.targetLanguage = "auto";

    const wrapper = mountPage();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(16);
    await flushPromises();

    expect(wrapper.text()).toContain("自动目标会优先翻译到系统语言");
  });

  it("re-activates cursor polling when a sync event arrives after the window was hidden", async () => {
    mountPage();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(16);
    await flushPromises();

    await vi.advanceTimersByTimeAsync(2_000);
    await flushPromises();
    expect(mocked.appWindow.hide).toHaveBeenCalledTimes(1);

    mocked.cursorPosition.mockResolvedValue({ x: 160, y: 160 });
    mocked.syncListener?.({
      payload: {
        value: "Japanese",
        label: "日本語",
        shortcutLabel: "Ctrl+~",
      },
    });
    await flushPromises();

    await vi.advanceTimersByTimeAsync(3_000);
    await flushPromises();
    expect(mocked.appWindow.hide).toHaveBeenCalledTimes(1);

    mocked.cursorPosition.mockResolvedValue({ x: 0, y: 0 });
    await vi.advanceTimersByTimeAsync(2_400);
    await flushPromises();
    expect(mocked.appWindow.hide).toHaveBeenCalledTimes(2);
  });
});
