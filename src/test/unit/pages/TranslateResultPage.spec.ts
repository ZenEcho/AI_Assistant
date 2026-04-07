import { reactive, toRefs } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TranslateResultPage from "@/pages/TranslateResultPage.vue";

const mocked = vi.hoisted(() => ({
  appConfigStore: null as any,
  translationStore: null as any,
  appWindow: {
    label: "result",
    show: vi.fn(async () => {}),
    unminimize: vi.fn(async () => {}),
    emitTo: vi.fn(async () => {}),
    listen: vi.fn(async () => vi.fn()),
    startDragging: vi.fn(async () => {}),
    hide: vi.fn(async () => {}),
  },
  useWindowSurfaceMode: vi.fn(),
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

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => mocked.appWindow,
}));

vi.mock("@/stores/appConfig", () => ({
  useAppConfigStore: () => mocked.appConfigStore,
}));

vi.mock("@/stores/translation", () => ({
  useTranslationStore: () => mocked.translationStore,
}));

vi.mock("@/composables/useWindowSurfaceMode", () => ({
  useWindowSurfaceMode: mocked.useWindowSurfaceMode,
}));

vi.mock("naive-ui", async () => {
  const vue = await vi.importActual<typeof import("vue")>("vue");
  const createStub = (name: string, tag = "div") =>
    vue.defineComponent({
      name,
      setup(_, { slots }) {
        return () => vue.h(tag, slots.default?.());
      },
    });

  return {
    NAlert: createStub("NAlert"),
    NButton: createStub("NButton", "button"),
    NIcon: createStub("NIcon"),
    NImage: vue.defineComponent({
      name: "NImage",
      inheritAttrs: false,
      setup(_, { attrs }) {
        return () => vue.h("img", attrs);
      },
    }),
    NInput: vue.defineComponent({
      name: "NInput",
      inheritAttrs: false,
      props: {
        value: {
          type: String,
          default: "",
        },
      },
      setup(props, { attrs }) {
        return () =>
          vue.h("textarea", {
            ...attrs,
            value: props.value,
            readonly: true,
          });
      },
    }),
    NSkeleton: createStub("NSkeleton"),
    NTag: createStub("NTag"),
  };
});

function createStores() {
  mocked.appConfigStore = reactive({});
  mocked.translationStore = reactive({
    currentModelName: "OCR Translator",
    currentRequest: {
      sourceText: "",
      sourceLanguage: "auto",
      targetLanguage: "Chinese (Simplified)",
      sourceImage: {
        dataUrl: "data:image/png;base64,abc123",
        mimeType: "image/png",
        name: "capture.png",
        width: 800,
        height: 600,
      },
    },
    currentResult: {
      mode: "image",
      text: "翻译文本",
      model: "gpt-4o-mini",
      provider: "openai-compatible",
      raw: null,
      imageTranslation: {
        ocr: {
          engine: {
            engineId: "rapidocr",
            engineVersion: "0.2.0",
          },
          blocks: [],
        },
        translation: {
          blocks: [],
          fullText: "翻译文本",
        },
        render: {
          imageDataUrl: "data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E",
          width: 800,
          height: 600,
        },
      },
    },
    errorMessage: "",
    loading: false,
    translate: vi.fn(async () => {}),
    presentResult: vi.fn(),
    clearResult: vi.fn(),
  });
}

describe("TranslateResultPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createStores();
  });

  it("shows the rendered translated image above the plain translated text", async () => {
    const wrapper = mount(TranslateResultPage);
    await flushPromises();

    const image = wrapper.get('[data-testid="image-translation-preview"]');

    expect((image.element as HTMLImageElement).src).toContain("data:image/svg+xml");
  });

  it("toggles between image preview and text view", async () => {
    const wrapper = mount(TranslateResultPage);
    await flushPromises();

    // Default: image mode shows image preview
    expect(wrapper.find('[data-testid="image-translation-preview-section"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="image-translation-text-section"]').exists()).toBe(false);

    // Click toggle to switch to text view
    const toggleButton = wrapper.get('[data-testid="result-page-display-toggle"]');
    await toggleButton.trigger("click");

    expect(wrapper.find('[data-testid="image-translation-preview-section"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="image-translation-text-section"]').exists()).toBe(true);

    const textarea = wrapper.get('[data-testid="image-translation-text"]');
    expect((textarea.element as HTMLTextAreaElement).value).toBe("翻译文本");
  });

  it("keeps the image preview section filling available space in compact layout", async () => {
    const wrapper = mount(TranslateResultPage);
    await flushPromises();

    const previewSection = wrapper.get('[data-testid="image-translation-preview-section"]');

    expect(previewSection.classes()).toEqual(expect.arrayContaining(["min-h-0", "flex-1"]));
  });
});
