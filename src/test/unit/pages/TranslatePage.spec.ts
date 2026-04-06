import { reactive, toRefs } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPreferences } from "@/constants/app";
import TranslatePage from "@/pages/TranslatePage.vue";

const mocked = vi.hoisted(() => ({
  appConfigStore: null as any,
  translationStore: null as any,
  appWindow: {
    label: "main",
    listen: vi.fn(async () => vi.fn()),
    startDragging: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  },
  hideCurrentWindowToTray: vi.fn(async () => {}),
  openSettingsWindow: vi.fn(async () => null),
  requestTranslationInResultWindow: vi.fn(async () => {}),
  showResultWindow: vi.fn(async () => ({ label: "result" })),
  hideResultWindow: vi.fn(async () => {}),
  isResultWindowVisible: vi.fn(async () => false),
  matchesShortcut: vi.fn(() => false),
  useWindowSurfaceMode: vi.fn(),
  resultVisibilityHandler: null as null | ((event: { payload?: { visible?: boolean } }) => void),
}));

vi.mock("pinia", async () => {
  const actual = await vi.importActual<typeof import("pinia")>("pinia");
  return {
    ...actual,
    storeToRefs(store: object) {
      return toRefs(store as never);
    },
  };
});

vi.mock("@vueuse/core", () => ({
  usePreferredDark: () => ({ value: false }),
  useEventListener: vi.fn(),
}));

vi.mock("naive-ui", async () => {
  const vue = await vi.importActual<typeof import("vue")>("vue");

  const createControlStub = (name: string, tag = "div", emits: string[] = ["click"]) =>
    vue.defineComponent({
      name,
      inheritAttrs: false,
      emits,
      setup(_, { attrs, emit, slots }) {
        return () =>
          vue.h(
            tag,
            {
              ...attrs,
              onClick: () => emit("click"),
            },
            slots.default?.(),
          );
      },
    });

  const NPopover = vue.defineComponent({
    name: "NPopover",
    inheritAttrs: false,
    setup(_, { slots }) {
      return () => vue.h("div", [slots.trigger?.(), slots.default?.()]);
    },
  });

  return {
    NAlert: createControlStub("NAlert"),
    NButton: createControlStub("NButton", "button"),
    NIcon: createControlStub("NIcon"),
    NPopover,
    NSelect: createControlStub("NSelect"),
  };
});

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => mocked.appWindow,
}));

vi.mock("@/stores/appConfig", () => ({
  useAppConfigStore: () => mocked.appConfigStore,
}));

vi.mock("@/stores/translation", () => ({
  useTranslationStore: () => mocked.translationStore,
}));

vi.mock("@/services/shortcut/shortcutUtils", () => ({
  matchesShortcut: mocked.matchesShortcut,
}));

vi.mock("@/composables/useWindowSurfaceMode", () => ({
  useWindowSurfaceMode: mocked.useWindowSurfaceMode,
}));

vi.mock("@/services/window/windowManager", () => ({
  hideCurrentWindowToTray: mocked.hideCurrentWindowToTray,
  openSettingsWindow: mocked.openSettingsWindow,
  requestTranslationInResultWindow: mocked.requestTranslationInResultWindow,
  showResultWindow: mocked.showResultWindow,
  hideResultWindow: mocked.hideResultWindow,
  isResultWindowVisible: mocked.isResultWindowVisible,
  TRANSLATION_RESULT_VISIBILITY_EVENT: "translation-result:visibility",
}));

function createStores() {
  const preferences = createDefaultPreferences();
  const defaultModel = {
    id: "model-1",
    name: "Default Model",
    provider: "openai-compatible" as const,
    baseUrl: "https://example.com/v1",
    apiKey: "test-key",
    model: "gpt-4o-mini",
    enabled: true,
    isDefault: true,
    systemPrompt: "translate",
    timeoutMs: 60_000,
    createdAt: "2026-04-04T00:00:00.000Z",
    updatedAt: "2026-04-04T00:00:00.000Z",
  };

  mocked.appConfigStore = reactive({
    preferences,
    defaultModel,
    enabledModels: [defaultModel],
    selectedTranslationModel: defaultModel,
    updateTranslationPreferences: vi.fn(async () => {}),
    setSelectedTranslationModelId: vi.fn(async () => {}),
    setThemeMode: vi.fn(async () => {}),
  });

  mocked.translationStore = reactive({
    history: [],
  });

  (mocked.appWindow.listen as any).mockImplementation(
    async (_eventName: string, handler: typeof mocked.resultVisibilityHandler) => {
      mocked.resultVisibilityHandler = handler;
      return () => {
        mocked.resultVisibilityHandler = null;
      };
    },
  );
}

function mountComponent() {
  return mount(TranslatePage);
}

function findButtonByText(wrapper: ReturnType<typeof mountComponent>, text: string) {
  return wrapper.findAll("button").find((button) => button.text().includes(text));
}

function findButtonByAriaLabel(wrapper: ReturnType<typeof mountComponent>, label: string) {
  return wrapper.find(`button[aria-label="${label}"]`);
}

describe("TranslatePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createStores();
    mocked.isResultWindowVisible.mockResolvedValue(false);
    mocked.showResultWindow.mockResolvedValue({ label: "result" });
  });

  it("shows a secondary toggle button to open the result window", async () => {
    const wrapper = mountComponent();
    await flushPromises();

    const button = findButtonByText(wrapper, "查看结果");
    expect(button).toBeTruthy();

    await button!.trigger("click");

    expect(mocked.showResultWindow).toHaveBeenCalledWith({
      focus: true,
    });
  });

  it("switches the secondary button to hide mode when the result window becomes visible", async () => {
    const wrapper = mountComponent();
    await flushPromises();

    mocked.resultVisibilityHandler?.({
      payload: {
        visible: true,
      },
    });
    await flushPromises();

    mocked.isResultWindowVisible.mockResolvedValue(true);
    const button = findButtonByText(wrapper, "隐藏结果");
    expect(button).toBeTruthy();

    await button!.trigger("click");

    expect(mocked.hideResultWindow).toHaveBeenCalledTimes(1);
  });

  it("hides the window to the tray when the tray button is clicked", async () => {
    const wrapper = mountComponent();
    await flushPromises();

    const button = findButtonByAriaLabel(wrapper, "隐藏到系统托盘");
    expect(button.exists()).toBe(true);

    await button.trigger("click");

    expect(mocked.hideCurrentWindowToTray).toHaveBeenCalledTimes(1);
  });
});
