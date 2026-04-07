import { reactive, toRefs } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPreferences } from "@/constants/app";
import TranslatePage from "@/pages/TranslatePage.vue";

const mocked = vi.hoisted(() => ({
  appConfigStore: null as any,
  translationStore: null as any,
  ocrStore: null as any,
  recognizeImageWithOcr: vi.fn(),
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
    NImage: createControlStub("NImage", "img"),
    NInput: vue.defineComponent({
      name: "NInput",
      inheritAttrs: false,
      props: {
        value: {
          type: String,
          default: "",
        },
      },
      emits: ["update:value", "keydown"],
      setup(props, { attrs, emit }) {
        return () =>
          vue.h("textarea", {
            ...attrs,
            value: props.value,
            onInput: (event: Event) =>
              emit("update:value", (event.target as HTMLTextAreaElement).value),
            onKeydown: (event: KeyboardEvent) => emit("keydown", event),
          });
      },
    }),
    NPopover,
    NProgress: createControlStub("NProgress"),
    NSelect: createControlStub("NSelect"),
    NTag: createControlStub("NTag"),
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

vi.mock("@/stores/ocr", () => ({
  useOcrStore: () => mocked.ocrStore,
}));

vi.mock("@/services/ocr/nativeBridge", () => ({
  recognizeImageWithOcr: mocked.recognizeImageWithOcr,
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

class MockFileReader {
  result: string | ArrayBuffer | null = null;
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;

  readAsDataURL(_file: Blob) {
    this.result = "data:image/png;base64,uploaded-image";
    this.onload?.();
  }
}

class MockImage {
  naturalWidth = 640;
  naturalHeight = 360;
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;

  set src(_value: string) {
    this.onload?.();
  }
}

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
    vi.stubGlobal("FileReader", MockFileReader);
    vi.stubGlobal("Image", MockImage);
    createStores();
    mocked.isResultWindowVisible.mockResolvedValue(false);
    mocked.showResultWindow.mockResolvedValue({ label: "result" });
    mocked.recognizeImageWithOcr.mockResolvedValue({
      engineId: "rapidocr",
      engineVersion: "0.2.0",
      imageWidth: 640,
      imageHeight: 360,
      blocks: [
        {
          id: "block-1",
          order: 0,
          sourceText: "Translate Text",
          score: 0.99,
          box: [[24, 40], [240, 40], [240, 96], [24, 96]],
          bbox: { x: 24, y: 40, width: 216, height: 56 },
        },
        {
          id: "block-2",
          order: 1,
          sourceText: "Copy page",
          score: 0.95,
          box: [[24, 104], [200, 104], [200, 144], [24, 144]],
          bbox: { x: 24, y: 104, width: 176, height: 40 },
        },
      ],
    });
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

  it("shows OCR download guidance and disables image translation when the preferred OCR engine is not installed", async () => {
    mocked.appConfigStore.preferences.translation.ocrEngine = "rapidocr";
    mocked.ocrStore.statuses = [
      {
        engineId: "rapidocr",
        status: "not-installed",
        version: null,
        downloadProgress: null,
        errorMessage: null,
      },
    ];
    mocked.translationStore.history = [
      {
        id: "history-1",
        createdAt: "2026-04-07T00:00:00.000Z",
        modelId: "model-1",
        modelName: "Default Model",
        request: {
          sourceText: "",
          sourceLanguage: "English",
          targetLanguage: "Chinese (Simplified)",
          resolution: null,
          hasSourceImage: true,
          sourceImageName: "capture.png",
          sourceImage: {
            dataUrl: "data:image/png;base64,abc123",
            mimeType: "image/png",
            name: "capture.png",
            width: 800,
            height: 600,
          },
        },
        result: {
          mode: "image",
          text: "翻译文本",
          model: "gpt-4o-mini",
          provider: "openai-compatible",
          raw: null,
          imageTranslation: null,
        },
      },
    ];

    const wrapper = mountComponent();
    await flushPromises();

    const historyButton = wrapper.findAll("button").find((button) => button.text().includes("Default Model"));
    expect(historyButton).toBeTruthy();

    await historyButton!.trigger("click");
    await flushPromises();

    const downloadButton = wrapper.find('[data-testid="translate-page-ocr-download"]');
    expect(downloadButton.exists()).toBe(true);

    const translateButton = wrapper.get('[data-testid="translate-page-submit"]');
    expect(translateButton.attributes("disabled")).toBeDefined();

    await downloadButton.trigger("click");

    expect(mocked.ocrStore.downloadEngine).toHaveBeenCalledWith("rapidocr");
  });

  it("toggles between the image preview and OCR source textarea after selecting an image", async () => {
    const wrapper = mountComponent();
    await flushPromises();

    const fileInput = wrapper.get('input[type="file"]');
    const file = new File(["binary"], "capture.png", { type: "image/png" });

    Object.defineProperty(fileInput.element, "files", {
      configurable: true,
      value: [file],
    });

    await fileInput.trigger("change");
    await flushPromises();

    const imagePreview = wrapper.get('[data-testid="translate-page-source-image"]');
    const toggleButton = wrapper.get('[data-testid="translate-page-image-display-toggle"]');

    expect(mocked.recognizeImageWithOcr).toHaveBeenCalledWith(
      "rapidocr",
      expect.objectContaining({
        name: "capture.png",
      }),
    );
    expect((imagePreview.element as HTMLImageElement).getAttribute("src")).toContain("data:image/png");
    expect(toggleButton.text()).toContain("查看文本");

    await toggleButton.trigger("click");
    await flushPromises();

    const input = wrapper.get('[data-testid="translate-page-source-input"]');

    expect((input.element as HTMLTextAreaElement).value).toBe("Translate Text\nCopy page");
    expect(input.attributes("disabled")).toBeDefined();
    expect(wrapper.find('[data-testid="translate-page-source-text-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="translate-page-source-image-panel"]').exists()).toBe(false);

    await wrapper.get('[data-testid="translate-page-image-display-toggle"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="translate-page-source-image-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="translate-page-source-text-panel"]').exists()).toBe(false);
  });

  it("submits the OCR payload after switching to the source textarea in image mode", async () => {
    const wrapper = mountComponent();
    await flushPromises();

    const fileInput = wrapper.get('input[type="file"]');
    const file = new File(["binary"], "capture.png", { type: "image/png" });

    Object.defineProperty(fileInput.element, "files", {
      configurable: true,
      value: [file],
    });

    await fileInput.trigger("change");
    await flushPromises();

    await wrapper.get('[data-testid="translate-page-image-display-toggle"]').trigger("click");
    await flushPromises();

    const input = wrapper.get('[data-testid="translate-page-source-input"]');
    expect((input.element as HTMLTextAreaElement).value).toBe("Translate Text\nCopy page");

    await wrapper.get('[data-testid="translate-page-submit"]').trigger("click");
    await flushPromises();

    expect(mocked.requestTranslationInResultWindow).toHaveBeenCalledWith({
      modelId: "model-1",
      request: expect.objectContaining({
        sourceText: "Translate Text\nCopy page",
        sourceImage: expect.objectContaining({
          name: "capture.png",
        }),
        sourceImageOcr: expect.objectContaining({
          engineId: "rapidocr",
          blocks: expect.arrayContaining([
            expect.objectContaining({
              sourceText: "Translate Text",
            }),
            expect.objectContaining({
              sourceText: "Copy page",
            }),
          ]),
        }),
      }),
    });
  });

  it("shows image-mode controls and removes the image from there", async () => {
    const wrapper = mountComponent();
    await flushPromises();

    const fileInput = wrapper.get('input[type="file"]');
    const file = new File(["binary"], "capture.png", { type: "image/png" });

    Object.defineProperty(fileInput.element, "files", {
      configurable: true,
      value: [file],
    });

    await fileInput.trigger("change");
    await flushPromises();

    const toolbar = wrapper.get('[data-testid="translate-page-image-toolbar"]');
    const meta = wrapper.get('[data-testid="translate-page-image-meta"]');
    const toggleButton = wrapper.get('[data-testid="translate-page-image-display-toggle"]');
    const removeButton = wrapper.get('[data-testid="translate-page-image-remove"]');

    expect(toolbar.text()).toContain("RapidOCR");
    expect(toggleButton.text()).toContain("查看文本");
    expect(meta.text()).toContain("capture.png");
    expect(meta.text()).toContain("图片已附加");

    await removeButton.trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="translate-page-source-image"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="translate-page-image-toolbar"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="translate-page-source-input"]').exists()).toBe(true);
  });
});
