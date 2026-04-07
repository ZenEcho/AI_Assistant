<script setup lang="ts">
import { useEventListener, usePreferredDark } from "@vueuse/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { storeToRefs } from "pinia";
import {
  ArrowLeftRight,
  History,
  ImagePlus,
  Minus,
  MoonStar,
  Settings2,
  SunMedium,
  X,
} from "lucide-vue-next";
import {
  NAlert,
  NButton,
  NIcon,
  NImage,
  NInput,
  NPopover,
  NProgress,
  NSelect,
  NTag,
  type SelectOption,
} from "naive-ui";
import {
  defaultSourceLanguage,
  defaultTargetLanguage,
  isAutoLanguageValue,
  resolveLanguageLabel,
  sourceLanguageOptions as sourceLanguageOptionList,
  targetLanguageOptions as targetLanguageOptionList,
} from "@/constants/languages";
import { useWindowSurfaceMode } from "@/composables/useWindowSurfaceMode";
import { DEFAULT_TRANSLATE_SHORTCUT } from "@/constants/app";
import { useAppConfigStore } from "@/stores/appConfig";
import { useOcrStore } from "@/stores/ocr";
import { useTranslationStore } from "@/stores/translation";
import { recognizeImageWithOcr } from "@/services/ocr/nativeBridge";
import { matchesShortcut } from "@/services/shortcut/shortcutUtils";
import { formatTranslationResolutionSummary } from "@/services/ai/translationResolutionFormatter";
import {
  hideCurrentWindowToTray,
  hideResultWindow,
  isResultWindowVisible,
  openSettingsWindow,
  requestTranslationInResultWindow,
  showResultWindow,
  TRANSLATION_RESULT_VISIBILITY_EVENT,
  type TranslationResultVisibilityPayload,
} from "@/services/window/windowManager";
import type { TranslationHistoryItem } from "@/types/ai";
import type { OcrEngineId, OcrRecognitionResult } from "@/types/ocr";

interface SourceImageState {
  dataUrl: string;
  mimeType: string;
  name: string;
  size: number;
  width: number;
  height: number;
}

const maxPastedImageSize = 10 * 1024 * 1024;
const ocrEngineLabelMap: Record<OcrEngineId, string> = {
  rapidocr: "RapidOCR",
  paddleocr: "PaddleOCR",
};

const appConfigStore = useAppConfigStore();
const ocrStore = useOcrStore();
const translationStore = useTranslationStore();
const appWindow = getCurrentWindow();
const preferredDark = usePreferredDark();

const { defaultModel, enabledModels, preferences, selectedTranslationModel } = storeToRefs(appConfigStore);
const { statuses: ocrStatuses } = storeToRefs(ocrStore);
const { history } = storeToRefs(translationStore);

const sourceText = ref("");
const sourceLanguage = ref(preferences.value.translation.sourceLanguage || defaultSourceLanguage);
const targetLanguage = ref(preferences.value.translation.targetLanguage || defaultTargetLanguage);
const selectedModelId = ref<string | null>(null);
const followsDefaultModel = ref(true);
const sourceImage = ref<SourceImageState | null>(null);
const sourceImageOcr = ref<OcrRecognitionResult | null>(null);
const sourceImageError = ref("");
const sourceImageOcrError = ref("");
const sourceImageOcrPending = ref(false);
const noticeText = ref("");
const translating = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const resultWindowVisible = ref(false);
const sourceImageDisplayMode = shallowRef<"image" | "text">("text");

let unlistenResultWindowVisibility: (() => void) | null = null;

const sourceLanguageOptions = computed<SelectOption[]>(() =>
  sourceLanguageOptionList.map((option) => ({
    label: option.label,
    value: option.value,
  })),
);
const targetLanguageOptions = computed<SelectOption[]>(() =>
  targetLanguageOptionList.map((option) => ({
    label: option.label,
    value: option.value,
  })),
);
const modelOptions = computed<SelectOption[]>(() =>
  enabledModels.value.map((model) => ({
    label: model.name,
    value: model.id,
  })),
);
const activeModel = computed(
  () =>
    enabledModels.value.find((model) => model.id === selectedModelId.value) ??
    defaultModel.value ??
    enabledModels.value[0] ??
    null,
);
const activeOcrEngine = computed(() => preferences.value.translation.ocrEngine);
const activeOcrStatus = computed(
  () =>
    ocrStatuses.value.find((item) => item.engineId === activeOcrEngine.value) ??
    ocrStore.getStatus(activeOcrEngine.value) ??
    null,
);
const activeOcrEngineLabel = computed(() => ocrEngineLabelMap[activeOcrEngine.value]);
const showOcrStatusCard = computed(
  () =>
    Boolean(sourceImage.value) &&
    (
      activeOcrStatus.value?.status !== "installed" ||
      sourceImageOcrPending.value ||
      Boolean(sourceImageOcrError.value)
    ),
);
const activeOcrDownloadProgress = computed(() => activeOcrStatus.value?.downloadProgress ?? 0);
const activeOcrStatusText = computed(() => {
  if (!sourceImage.value) {
    return "";
  }

  if (sourceImageOcrPending.value) {
    return activeOcrEngineLabel.value + " 正在进行 OCR 识别。请稍候…";
  }

  if (sourceImageOcrError.value) {
    return sourceImageOcrError.value;
  }

  if (activeOcrStatus.value?.status === "downloading") {
    return activeOcrEngineLabel.value + " 正在下载。安装完成后，OCR 将自动开始。";
  }

  if (activeOcrStatus.value?.status === "failed") {
    return activeOcrEngineLabel.value + " 安装失败。请重试。";
  }

  if (activeOcrStatus.value?.status != "installed") {
    return activeOcrEngineLabel.value + " 尚未安装。请点击下载引擎按钮进行安装。";
  }

  return activeOcrEngineLabel.value + " 已安装并准备好进行文本识别。";
});
const hasSourceContent = computed(() => Boolean(sourceText.value.trim()));
const sourceInputDisabled = computed(() => translating.value || Boolean(sourceImage.value));
const canTranslate = computed(
  () =>
    Boolean(activeModel.value) &&
    hasSourceContent.value &&
    Boolean(targetLanguage.value) &&
    (!sourceImage.value ||
      (
        activeOcrStatus.value?.status === "installed" &&
        Boolean(sourceImageOcr.value) &&
        !sourceImageOcrPending.value
      )),
);
const canSwapLanguages = computed(
  () =>
    !translating.value &&
    Boolean(targetLanguage.value) &&
    !isAutoLanguageValue(sourceLanguage.value) &&
    !isAutoLanguageValue(targetLanguage.value),
);
const sourceImageSummary = computed(() =>
  sourceImage.value ? formatFileSize(sourceImage.value.size) + " 图片已附加" : "",
);
const resultToggleLabel = computed(() => (resultWindowVisible.value ? "隐藏结果" : "查看结果"));
const showSourceImagePreview = computed(() =>
  Boolean(sourceImage.value) && sourceImageDisplayMode.value === "image",
);
const sourceImageDisplayToggleLabel = computed(() =>
  sourceImageDisplayMode.value === "image" ? "查看文本" : "查看图片",
);
const statusAlertType = computed(() => (
  sourceImageError.value || sourceImageOcrError.value ? "error" : "info"
));
const statusAlertText = computed(() => sourceImageError.value || sourceImageOcrError.value || noticeText.value);
const sourceInputPlaceholder = computed(() =>
  sourceImage.value
    ? (sourceImageOcrPending.value
      ? "OCR 正在从图片中提取文本。"
      : "识别出的图片文本将显示在此处。")
    : "在此输入文本，或粘贴/上传图片。",
);
const resolvedThemeMode = computed(() =>
  preferences.value.themeMode === "auto"
    ? preferredDark.value
      ? "dark"
      : "light"
    : preferences.value.themeMode,
);
const themeToggleLabel = computed(() =>
  resolvedThemeMode.value === "dark" ? "切换到浅色模式" : "切换到深色模式",
);
const recentHistory = computed(() => history.value);
const hasRecentHistory = computed(() => recentHistory.value.length > 0);
const recentHistoryLabel = computed(() =>
  hasRecentHistory.value ? "最近 " + recentHistory.value.length : "暂无历史",
);
const dragExcludedSelector = [
  "button",
  "input",
  "textarea",
  "select",
  "[role='button']",
  "[role='combobox']",
  ".n-base-selection",
].join(", ");

useWindowSurfaceMode("default");

function normalizeSourceLanguageValue(value: string | null | undefined): string {
  return sourceLanguageOptions.value.some((option) => option.value === value)
    ? value ?? defaultSourceLanguage
    : defaultSourceLanguage;
}

function normalizeTargetLanguageValue(value: string | null | undefined): string {
  return targetLanguageOptions.value.some((option) => option.value === value)
    ? value ?? defaultTargetLanguage
    : defaultTargetLanguage;
}

function syncSelectedLanguages() {
  const nextSource = normalizeSourceLanguageValue(sourceLanguage.value);
  const nextTarget = normalizeTargetLanguageValue(targetLanguage.value);

  if (sourceLanguage.value !== nextSource) {
    sourceLanguage.value = nextSource;
  }

  if (targetLanguage.value !== nextTarget) {
    targetLanguage.value = nextTarget;
  }

  return {
    source: nextSource,
    target: nextTarget,
  };
}

watch(
  () => preferences.value.translation,
  (value) => {
    const nextSource = normalizeSourceLanguageValue(value.sourceLanguage);
    const nextTarget = normalizeTargetLanguageValue(value.targetLanguage);

    if (sourceLanguage.value !== nextSource) {
      sourceLanguage.value = nextSource;
    }

    if (targetLanguage.value !== nextTarget) {
      targetLanguage.value = nextTarget;
    }
  },
  { deep: true, immediate: true },
);

watch([sourceLanguage, targetLanguage], ([nextSourceValue, nextTargetValue]) => {
  const { source, target } = syncSelectedLanguages();

  if (
    preferences.value.translation.sourceLanguage === source &&
    preferences.value.translation.targetLanguage === target &&
    nextSourceValue === source &&
    nextTargetValue === target
  ) {
    return;
  }

  void appConfigStore.updateTranslationPreferences({
    sourceLanguage: source,
    targetLanguage: target,
  });
}, { immediate: true });

watch(
  [enabledModels, defaultModel, selectedTranslationModel],
  ([models, nextDefault, nextSelected]) => {
    if (!models.length) {
      selectedModelId.value = null;
      followsDefaultModel.value = false;
      return;
    }

    const preferredModelId = nextSelected?.id ?? nextDefault?.id ?? models[0]?.id ?? null;
    const selectedExists = models.some((model) => model.id === preferredModelId);

    if (!selectedExists) {
      selectedModelId.value = nextDefault?.id ?? models[0]?.id ?? null;
      followsDefaultModel.value = true;
      return;
    }

    selectedModelId.value = preferredModelId;
    followsDefaultModel.value = preferredModelId === nextDefault?.id;
  },
  { immediate: true },
);

watch(
  () => activeOcrEngine.value,
  () => {
    if (!sourceImage.value) {
      return;
    }

    sourceImageOcr.value = null;
    sourceImageOcrError.value = "";
    sourceImageOcrPending.value = false;
    sourceText.value = "";

    if (activeOcrStatus.value?.status === "installed") {
      void recognizeCurrentImage(true);
    }
  },
);

watch(
  sourceImage,
  (nextSourceImage) => {
    sourceImageDisplayMode.value = nextSourceImage ? "image" : "text";
  },
  { immediate: true },
);

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function estimateDataUrlSize(dataUrl: string): number {
  const payload = dataUrl.split(",", 2)[1] ?? "";
  const paddingMatch = payload.match(/=+$/);
  const paddingLength = paddingMatch?.[0].length ?? 0;

  return Math.max(0, Math.floor((payload.length * 3) / 4) - paddingLength);
}

function getPastedImageFile(event: ClipboardEvent): File | null {
  const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) =>
    item.type.startsWith("image/"),
  );

  return imageItem?.getAsFile() ?? null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("图片读取失败，请重试。"));
    };
    reader.onerror = () => reject(new Error("图片读取失败，请重试。"));
    reader.readAsDataURL(file);
  });
}

function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width || 1,
        height: image.naturalHeight || image.height || 1,
      });
    };
    image.onerror = () => reject(new Error("图片尺寸读取失败，请重试。"));
    image.src = dataUrl;
  });
}

async function createSourceImageState(file: File): Promise<SourceImageState> {
  if (file.size > maxPastedImageSize) {
    throw new Error("粘贴或上传的图片过大，请控制在 10 MB 以内。");
  }

  const mimeType = file.type || "image/png";
  const extension = mimeType.split("/")[1] || "png";
  const dataUrl = await readFileAsDataUrl(file);
  const { width, height } = await loadImageDimensions(dataUrl);

  return {
    dataUrl,
    mimeType,
    name: file.name?.trim() || `pasted-image.${extension}`,
    size: file.size,
    width,
    height,
  };
}

function buildSourceImagePayload(image: SourceImageState) {
  return {
    dataUrl: image.dataUrl,
    mimeType: image.mimeType,
    name: image.name,
    width: image.width,
    height: image.height,
  };
}
//  将 OCR 结果中的文本块按顺序拼接成完整的识别文本
function buildRecognizedSourceText(ocrResult: OcrRecognitionResult) {
  return [...ocrResult.blocks]
    .sort((left, right) => left.order - right.order)
    .map((block) => block.sourceText.trim())
    .filter(Boolean)
    .join("\n");
}

function resolveHistoryOcrResult(item: TranslationHistoryItem) {
  if (item.request.sourceImageOcr) {
    return item.request.sourceImageOcr;
  }

  const historyOcr = item.result.imageTranslation?.ocr;
  if (!historyOcr) {
    return null;
  }

  return {
    engineId: historyOcr.engine.engineId,
    engineVersion: historyOcr.engine.engineVersion,
    imageWidth: item.request.sourceImage?.width ?? 1,
    imageHeight: item.request.sourceImage?.height ?? 1,
    blocks: historyOcr.blocks,
  };
}

async function recognizeCurrentImage(force = false) {
  if (!sourceImage.value) {
    return false;
  }

  if (!force && sourceImageOcr.value?.engineId === activeOcrEngine.value) {
    return true;
  }

  if (activeOcrStatus.value?.status !== "installed") {
    return false;
  }

  sourceImageOcrPending.value = true;
  sourceImageOcrError.value = "";
  noticeText.value = "";

  try {
    const ocrResult = await recognizeImageWithOcr(
      activeOcrEngine.value,
      buildSourceImagePayload(sourceImage.value),
    );
    const recognizedText = buildRecognizedSourceText(ocrResult);

    sourceImageOcr.value = ocrResult;
    sourceText.value = recognizedText;

    if (!recognizedText) {
      noticeText.value = "No translatable text was detected in the image.";
    }

    return true;
  } catch (error) {
    sourceImageOcr.value = null;
    sourceText.value = "";
    sourceImageOcrError.value = error instanceof Error ? error.message : "OCR failed. Please retry.";
    return false;
  } finally {
    sourceImageOcrPending.value = false;
  }
}

async function applySourceImage(file: File) {
  sourceImageError.value = "";
  sourceImageOcrError.value = "";
  noticeText.value = "";
  sourceImageOcr.value = null;
  sourceImageOcrPending.value = false;

  try {
    sourceText.value = "";
    sourceImage.value = await createSourceImageState(file);

    if (activeOcrStatus.value?.status === "installed") {
      await recognizeCurrentImage(true);
    }
  } catch (error) {
    sourceImage.value = null;
    sourceImageOcr.value = null;
    sourceImageError.value = error instanceof Error ? error.message : "Image loading failed. Please retry.";
  }
}

function triggerFilePicker() {
  fileInputRef.value?.click();
}

async function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  await applySourceImage(file);
  input.value = "";
}

async function handleImagePaste(event: ClipboardEvent) {
  const file = getPastedImageFile(event);

  if (!file) {
    return;
  }

  event.preventDefault();
  await applySourceImage(file);
}

async function handleOpenSettings(tab: "models" | "app" = "models") {
  await openSettingsWindow(tab);
}

async function handleDownloadCurrentOcr() {
  const status = await ocrStore.downloadEngine(activeOcrEngine.value);

  if (sourceImage.value && status?.status === "installed") {
    await recognizeCurrentImage(true);
  }
}

function handleToggleSourceImageDisplay() {
  if (!sourceImage.value) {
    return;
  }

  sourceImageDisplayMode.value = sourceImageDisplayMode.value === "image" ? "text" : "image";
}

async function handleModelChange(value: string | number | null) {
  selectedModelId.value = typeof value === "string" ? value : null;
  followsDefaultModel.value = selectedModelId.value === defaultModel.value?.id;
  await appConfigStore.setSelectedTranslationModelId(selectedModelId.value);
}

function canTranslateCurrentImage() {
  return !sourceImage.value || (
    activeOcrStatus.value?.status === "installed" &&
    Boolean(sourceImageOcr.value) &&
    !sourceImageOcrPending.value &&
    Boolean(sourceText.value.trim())
  );
}

function formatHistoryTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "刚刚";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatPreviewText(text: string, maxLength = 84) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "（空文本）";
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}

function formatHistorySourcePreview(item: TranslationHistoryItem) {
  if (item.request.sourceText.trim()) {
    return formatPreviewText(item.request.sourceText);
  }

  if (item.request.sourceImage || item.request.hasSourceImage) {
    const sourceImageName = item.request.sourceImage?.name ?? item.request.sourceImageName;

    return sourceImageName ? `图片：${sourceImageName}` : "图片翻译记录";
  }

  return "（空文本）";
}

function formatHistoryResultPreview(item: TranslationHistoryItem) {
  return formatPreviewText(item.result.text, 96);
}

function formatHistoryLanguagePair(item: TranslationHistoryItem) {
  const requestedSource = item.request.resolution?.requestedSourceLanguage ?? item.request.sourceLanguage;
  const requestedTarget = item.request.resolution?.requestedTargetLanguage ?? item.request.targetLanguage;
  const resolvedTarget = item.request.resolution?.resolvedTargetLanguage ?? item.request.targetLanguage;

  if (item.request.resolution?.usedAutoTarget) {
    return `${resolveLanguageLabel(requestedSource)} → 自动 -> ${resolveLanguageLabel(resolvedTarget)}`;
  }

  return `${resolveLanguageLabel(requestedSource)} → ${resolveLanguageLabel(requestedTarget)}`;
}

function formatHistoryResolutionSummary(item: TranslationHistoryItem) {
  return formatTranslationResolutionSummary(item.request.resolution);
}

function resolveHistoryModel(item: TranslationHistoryItem) {
  return (
    enabledModels.value.find((model) => model.id === item.modelId) ??
    enabledModels.value.find((model) => model.name === item.modelName) ??
    defaultModel.value ??
    enabledModels.value[0] ??
    null
  );
}

async function handleToggleTheme() {
  await appConfigStore.setThemeMode(resolvedThemeMode.value === "dark" ? "light" : "dark");
}

function handleSwapLanguages() {
  const { source, target } = syncSelectedLanguages();

  if (source === defaultSourceLanguage) {
    noticeText.value = "源语言为自动检测时无法互换，请先手动选择源语言。";
    return;
  }

  if (isAutoLanguageValue(target)) {
    noticeText.value = "目标语言为自动目标时无法互换，请先手动选择目标语言。";
    return;
  }

  sourceLanguage.value = target;
  targetLanguage.value = source;
  noticeText.value = "";
}

async function handleTranslate() {
  const { source, target } = syncSelectedLanguages();

  if (!activeModel.value) {
    noticeText.value = "Please enable at least one model in settings.";
    return;
  }

  if (!hasSourceContent.value) {
    noticeText.value = "Enter text or attach an image before translating.";
    return;
  }

  if (sourceImage.value && !sourceImageOcr.value) {
    const prepared = await recognizeCurrentImage(true);
    if (!prepared) {
      noticeText.value = activeOcrStatusText.value;
      return;
    }
  }

  if (!canTranslateCurrentImage()) {
    noticeText.value = activeOcrStatusText.value;
    return;
  }

  translating.value = true;
  noticeText.value = "";

  try {
    await requestTranslationInResultWindow({
      modelId: activeModel.value.id,
      request: {
        sourceText: sourceText.value,
        sourceLanguage: source,
        targetLanguage: target,
        sourceImage: sourceImage.value ? buildSourceImagePayload(sourceImage.value) : null,
        sourceImageOcr: sourceImageOcr.value,
      },
    });
    resultWindowVisible.value = true;
  } catch (error) {
    noticeText.value = error instanceof Error ? error.message : "Failed to open the result window.";
  } finally {
    translating.value = false;
  }
}

async function handleLoadHistoryItem(item: TranslationHistoryItem) {
  const historyModel = resolveHistoryModel(item);
  const requestedSourceLanguage =
    item.request.resolution?.requestedSourceLanguage ?? item.request.sourceLanguage;
  const requestedTargetLanguage =
    item.request.resolution?.requestedTargetLanguage ?? item.request.targetLanguage;

  sourceLanguage.value = requestedSourceLanguage;
  targetLanguage.value = requestedTargetLanguage;
  sourceImage.value = item.request.sourceImage
    ? {
      dataUrl: item.request.sourceImage.dataUrl,
      mimeType: item.request.sourceImage.mimeType,
      name:
        item.request.sourceImage.name?.trim() ||
        item.request.sourceImageName?.trim() ||
        "history-image",
      size: estimateDataUrlSize(item.request.sourceImage.dataUrl),
      width: item.request.sourceImage.width ?? 1,
      height: item.request.sourceImage.height ?? 1,
    }
    : null;
  sourceImageError.value = "";
  sourceImageOcrError.value = "";
  sourceImageOcrPending.value = false;
  sourceImageOcr.value = resolveHistoryOcrResult(item);
  sourceText.value = item.request.sourceText || (sourceImageOcr.value ? buildRecognizedSourceText(sourceImageOcr.value) : "");

  if (historyModel) {
    selectedModelId.value = historyModel.id;
    followsDefaultModel.value = historyModel.id === defaultModel.value?.id;
    await appConfigStore.setSelectedTranslationModelId(historyModel.id);
  }

  if (!historyModel) {
    noticeText.value = "No available model. The history content has been restored.";
    return;
  }

  translating.value = true;
  noticeText.value = "";

  if (sourceImage.value && !sourceImageOcr.value) {
    const prepared = await recognizeCurrentImage(true);
    if (!prepared) {
      noticeText.value = activeOcrStatusText.value;
      translating.value = false;
      return;
    }
  }

  if (sourceImage.value && !canTranslateCurrentImage()) {
    noticeText.value = activeOcrStatusText.value;
    translating.value = false;
    return;
  }

  try {
    await requestTranslationInResultWindow({
      modelId: historyModel.id,
      request: {
        sourceText: sourceText.value,
        sourceLanguage: requestedSourceLanguage,
        targetLanguage: requestedTargetLanguage,
        sourceImage: item.request.sourceImage ?? null,
        sourceImageOcr: sourceImageOcr.value,
      },
    });
    resultWindowVisible.value = true;
  } catch (error) {
    noticeText.value = error instanceof Error ? error.message : "Failed to load recent history.";
  } finally {
    translating.value = false;
  }
}

function clearAll() {
  sourceText.value = "";
  sourceImage.value = null;
  sourceImageOcr.value = null;
  sourceImageError.value = "";
  sourceImageOcrError.value = "";
  sourceImageOcrPending.value = false;
  noticeText.value = "";
}

function removeSourceImage() {
  sourceImage.value = null;
  sourceImageOcr.value = null;
  sourceImageError.value = "";
  sourceImageOcrError.value = "";
  sourceImageOcrPending.value = false;
}

function handleSourceKeydown(event: KeyboardEvent) {
  const translateShortcut = preferences.value.translateShortcut || DEFAULT_TRANSLATE_SHORTCUT;

  if (matchesShortcut(event, translateShortcut) && !translating.value) {
    event.preventDefault();
    void handleTranslate();
  }
}

async function refreshResultWindowVisibility() {
  resultWindowVisible.value = await isResultWindowVisible();
}

async function handleToggleResultWindow() {
  try {
    if (await isResultWindowVisible()) {
      await hideResultWindow();
      resultWindowVisible.value = false;
      return;
    }

    const resultWindow = await showResultWindow({
      focus: true,
    });

    if (!resultWindow) {
      noticeText.value = "当前环境不支持独立结果窗口。";
      return;
    }

    resultWindowVisible.value = true;
    noticeText.value = "";
  } catch (error) {
    noticeText.value = error instanceof Error ? error.message : "切换结果窗口失败。";
  }
}

function shouldIgnoreDragTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(dragExcludedSelector));
}

function handleBarMouseDown(event: MouseEvent) {
  if (shouldIgnoreDragTarget(event.target)) {
    return;
  }

  void appWindow.startDragging();
}

function handleClose() {
  void appWindow.close();
}

function handleHideToTray() {
  void hideCurrentWindowToTray();
}

if (typeof window !== "undefined") {
  useEventListener(window, "paste", (event) => {
    void handleImagePaste(event);
  });
}

onMounted(async () => {
  void ocrStore.initialize();
  await refreshResultWindowVisibility();
  unlistenResultWindowVisibility = await appWindow.listen<TranslationResultVisibilityPayload>(
    TRANSLATION_RESULT_VISIBILITY_EVENT,
    (event) => {
      resultWindowVisible.value = Boolean(event.payload?.visible);
    },
  );
});

onBeforeUnmount(() => {
  unlistenResultWindowVisibility?.();
  unlistenResultWindowVisibility = null;
});
</script>

<template>
  <div
    class="flex h-[100dvh] w-full min-h-0 flex-col bg-[var(--app-surface)] text-foreground transition-colors duration-300">
    <header class="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3"
      @mousedown.left="handleBarMouseDown">

      <div class="min-w-0 flex-1 select-none">
        <div class="truncate text-sm font-semibold text-foreground">翻译</div>
      </div>
      <div @mousedown.stop> <n-select :value="selectedModelId" :options="modelOptions"
          :disabled="translating || modelOptions.length === 0" size="small" filterable placeholder="模型"
          @update:value="handleModelChange" /></div>
      <div class="flex shrink-0 items-center gap-1.5" @mousedown.stop>
        <n-button quaternary circle size="small" :aria-label="themeToggleLabel" @click="handleToggleTheme">
          <template #icon>
            <n-icon>
              <component :is="resolvedThemeMode === 'dark' ? SunMedium : MoonStar" />
            </n-icon>
          </template>
        </n-button>

        <n-button quaternary circle size="small" aria-label="打开模型设置" @click="handleOpenSettings('models')">
          <template #icon>
            <n-icon>
              <Settings2 />
            </n-icon>
          </template>
        </n-button>

        <n-button quaternary circle size="small" aria-label="隐藏到系统托盘" @click="handleHideToTray">
          <template #icon>
            <n-icon>
              <Minus />
            </n-icon>
          </template>
        </n-button>

        <n-button quaternary circle size="small" aria-label="关闭翻译窗口" @click="handleClose">
          <template #icon>
            <n-icon>
              <X />
            </n-icon>
          </template>
        </n-button>
      </div>

    </header>

    <div class="flex min-h-0 flex-1 flex-col px-4 py-4">
      <div v-if="showOcrStatusCard" class="mb-2 rounded-[12px] border border-border/60 bg-[var(--app-surface-elevated)] px-3 py-3">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="text-[12px] font-semibold text-foreground">图片 OCR 引擎</div>
            <div class="mt-1 text-[12px] text-muted-foreground">
              {{ activeOcrStatusText }}
            </div>
          </div>
          <n-button v-if="activeOcrStatus?.status !== 'downloading'" data-testid="translate-page-ocr-download"
            size="small"
            secondary
            @click="void handleDownloadCurrentOcr()">
            {{
              activeOcrStatus?.status === "installed"
                ? "重新识别"
                : activeOcrStatus?.status === "failed"
                  ? "重试下载"
                  : "下载引擎"
            }}
          </n-button>
        </div>

        <n-progress v-if="activeOcrStatus?.status === 'downloading'" class="mt-3" type="line"
          :percentage="activeOcrDownloadProgress" :show-indicator="true" />

        <div v-if="activeOcrStatus?.errorMessage" class="mt-2 text-[12px] text-red-500">
          {{ activeOcrStatus.errorMessage }}
        </div>
      </div>

      <n-alert v-if="statusAlertText" class="mb-2" :type="statusAlertType" :show-icon="false">
        {{ statusAlertText }}
      </n-alert>

      <div
        class="flex min-h-0 flex-1 flex-col gap-3 rounded-[16px] border border-border/60 bg-[var(--app-surface-elevated)] px-4 py-3">
        <template v-if="sourceImage">
          <div
            data-testid="translate-page-image-toolbar"
            class="flex items-center justify-between gap-3 rounded-[12px] border border-border/60 bg-[var(--app-surface)] px-3 py-2"
          >
            <div class="min-w-0 flex flex-wrap items-center gap-1.5">
              <n-tag size="small" round :bordered="false" type="info"> OCR: {{ activeOcrEngineLabel }}</n-tag>
            </div>

            <div class="flex items-center gap-2">

              <n-button
                data-testid="translate-page-image-display-toggle"
                tertiary
                size="small"
                :disabled="translating"
                @click="handleToggleSourceImageDisplay"
              >
                {{ sourceImageDisplayToggleLabel }}
              </n-button>
              <n-button type="error" data-testid="translate-page-image-remove" class="shadow-sm"
                tertiary size="small" :disabled="translating" @click="removeSourceImage">
                移除
              </n-button>
            </div>
          </div>

          <div class="flex min-h-0 flex-1 flex-col gap-3">
            <div class="flex min-h-0 flex-1 overflow-hidden rounded-[12px] border border-border/60 bg-[var(--app-surface)]">
              <div
                v-if="showSourceImagePreview"
                data-testid="translate-page-source-image-panel"
                class="flex min-h-0 flex-1 items-center justify-center p-3"
              >
                <n-image
                  data-testid="translate-page-source-image"
                  :src="sourceImage.dataUrl"
                  :alt="sourceImage.name"
                  object-fit="contain"
                  class="max-h-full max-w-full"
                />
              </div>

              <div
                v-else
                data-testid="translate-page-source-text-panel"
                class="flex min-h-0 flex-1 p-3"
              >
                <n-input
                  data-testid="translate-page-source-input"
                  v-model:value="sourceText"
                  type="textarea"
                  spellcheck="false"
                  aria-label="Source content"
                  :disabled="sourceInputDisabled"
                  :placeholder="sourceInputPlaceholder"
                  :input-props="{ rows: 10, style: { height: '100%' } }"
                  class="resize-none h-full min-h-0 flex-1"
                  @keydown="handleSourceKeydown"
                />
              </div>
            </div>

            <div data-testid="translate-page-image-meta">
              <div class="rounded-[10px] border border-border/60 bg-[var(--app-surface)] px-3 py-2">
                <div class="truncate text-xs font-medium text-foreground">{{ sourceImage.name }}</div>
                <div class="mt-0.5 text-[11px] text-muted-foreground">{{ sourceImageSummary }}</div>
              </div>
            </div>
          </div>
        </template>

        <n-input v-else data-testid="translate-page-source-input" v-model:value="sourceText"
          type="textarea" spellcheck="false" aria-label="Source content" :disabled="sourceInputDisabled"
          :autosize="{ minRows: 12, maxRows: 18 }"
          :placeholder="sourceInputPlaceholder" class="resize-none h-full min-h-[256px]"
          @keydown="handleSourceKeydown" />
      </div>
      <div class="mt-3 flex flex-col gap-2">
        <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2" @mousedown.stop>
          <label class="min-w-0">
            <div class="mb-1 text-[11px] text-muted-foreground">源语言</div>
            <n-select v-model:value="sourceLanguage" :options="sourceLanguageOptions" size="small"
              :disabled="translating" placeholder="自动" />
          </label>

          <div class="flex items-end justify-center pb-0.5">
            <n-button quaternary circle size="small" aria-label="交换源语言和目标语言" :disabled="!canSwapLanguages"
              @click="handleSwapLanguages">
              <template #icon>
                <n-icon>
                  <ArrowLeftRight />
                </n-icon>
              </template>
            </n-button>
          </div>

          <label class="min-w-0">
            <div class="mb-1 text-[11px] text-muted-foreground">目标语言</div>
            <n-select v-model:value="targetLanguage" :options="targetLanguageOptions" size="small"
              :disabled="translating" placeholder="目标" />
          </label>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2" @mousedown.stop>
          <div class="flex flex-wrap items-center gap-2">
            <input ref="fileInputRef" type="file" accept="image/*" class="hidden" @change="handleFileSelected" />

            <n-button secondary size="small" @click="triggerFilePicker">
              <template #icon>
                <n-icon>
                  <ImagePlus />
                </n-icon>
              </template>
              图片
            </n-button>

            <n-button tertiary size="small" :disabled="translating" @click="clearAll">清空</n-button>

            <span class="text-[11px] text-muted-foreground">{{ sourceText.length }} 字</span>
          </div>

          <div class="flex items-center gap-2">
            <n-popover trigger="hover" placement="top-end" :show-arrow="false" :delay="120">
              <template #trigger>
                <n-button quaternary circle size="small" aria-label="最近记录">
                  <template #icon>
                    <n-icon>
                      <History />
                    </n-icon>
                  </template>
                </n-button>
              </template>

              <div class="w-[340px]" @mousedown.stop>
                <div class="mb-2 flex items-center justify-between gap-3">
                  <div class="text-sm font-semibold text-foreground">最近记录</div>
                  <div class="text-[11px] text-muted-foreground">{{ recentHistoryLabel }}</div>
                </div>

                <div v-if="hasRecentHistory" class="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                  <button v-for="item in recentHistory" :key="item.id" type="button"
                    class="w-full rounded-[14px] border border-border/60 bg-[var(--app-surface-elevated)] px-3 py-3 text-left transition-colors hover:border-border hover:bg-[var(--app-surface-soft)]"
                    @click="handleLoadHistoryItem(item)">
                    <div class="flex items-center justify-between gap-2">
                      <span class="min-w-0 truncate text-[11px] font-medium text-muted-foreground">
                        {{ item.modelName }}
                      </span>
                      <span class="shrink-0 text-[11px] text-muted-foreground">
                        {{ formatHistoryTime(item.createdAt) }}
                      </span>
                    </div>

                    <div class="mt-2 text-[11px] text-muted-foreground">原文</div>
                    <div class="mt-1 text-[13px] leading-5 text-foreground">
                      {{ formatHistorySourcePreview(item) }}
                    </div>

                    <div class="mt-2 text-[11px] text-muted-foreground">译文</div>
                    <div class="mt-1 text-[13px] leading-5 text-foreground/85">
                      {{ formatHistoryResultPreview(item) }}
                    </div>

                    <div class="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>{{ formatHistoryLanguagePair(item) }}</span>
                      <span>
                        {{ item.request.hasSourceImage ? "含图片，可完整恢复" : "点击直接加载" }}
                      </span>
                    </div>
                    <div v-if="formatHistoryResolutionSummary(item)"
                      class="mt-2 text-[11px] leading-5 text-muted-foreground">
                      {{ formatHistoryResolutionSummary(item) }}
                    </div>
                  </button>
                </div>

                <div v-else
                  class="rounded-[14px] border border-dashed border-border/60 bg-[var(--app-surface-elevated)] px-4 py-6 text-center text-[13px] text-muted-foreground">
                  暂无最近记录
                </div>
              </div>
            </n-popover>
            <n-button secondary size="medium" @click="handleToggleResultWindow">
              {{ resultToggleLabel }}
            </n-button>
            <n-button data-testid="translate-page-submit" type="primary" size="medium" class="min-w-[116px]"
              :loading="translating" :disabled="!canTranslate" @click="handleTranslate">
              {{ translating ? "处理中" : "开始翻译" }}
            </n-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
