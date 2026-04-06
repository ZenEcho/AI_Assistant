<script setup lang="ts">
import { useEventListener, usePreferredDark } from "@vueuse/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
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
import { NAlert, NButton, NIcon, NPopover, NSelect, type SelectOption } from "naive-ui";
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
import { useTranslationStore } from "@/stores/translation";
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

interface SourceImageState {
  dataUrl: string;
  mimeType: string;
  name: string;
  size: number;
}

const maxPastedImageSize = 10 * 1024 * 1024;

const appConfigStore = useAppConfigStore();
const translationStore = useTranslationStore();
const appWindow = getCurrentWindow();
const preferredDark = usePreferredDark();

const { defaultModel, enabledModels, preferences, selectedTranslationModel } = storeToRefs(appConfigStore);
const { history } = storeToRefs(translationStore);

const sourceText = ref("");
const sourceLanguage = ref(preferences.value.translation.sourceLanguage || defaultSourceLanguage);
const targetLanguage = ref(preferences.value.translation.targetLanguage || defaultTargetLanguage);
const selectedModelId = ref<string | null>(null);
const followsDefaultModel = ref(true);
const sourceImage = ref<SourceImageState | null>(null);
const sourceImageError = ref("");
const noticeText = ref("");
const translating = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const resultWindowVisible = ref(false);

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
const hasSourceContent = computed(
  () => Boolean(sourceText.value.trim()) || Boolean(sourceImage.value),
);
const canTranslate = computed(
  () => Boolean(activeModel.value) && hasSourceContent.value && Boolean(targetLanguage.value),
);
const canSwapLanguages = computed(
  () =>
    !translating.value &&
    Boolean(targetLanguage.value) &&
    !isAutoLanguageValue(sourceLanguage.value) &&
    !isAutoLanguageValue(targetLanguage.value),
);
const sourceImageSummary = computed(() =>
  sourceImage.value ? `${formatFileSize(sourceImage.value.size)} · 图片已附加` : "",
);
const currentModelLabel = computed(() => activeModel.value?.name ?? "未启用模型");
const resultToggleLabel = computed(() => (resultWindowVisible.value ? "隐藏结果" : "查看结果"));
const statusAlertType = computed(() => (sourceImageError.value ? "error" : "info"));
const statusAlertText = computed(() => sourceImageError.value || noticeText.value);
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
  hasRecentHistory.value ? `最近 ${recentHistory.value.length} 条` : "暂无记录",
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

async function createSourceImageState(file: File): Promise<SourceImageState> {
  if (file.size > maxPastedImageSize) {
    throw new Error("粘贴或上传的图片过大，请控制在 10 MB 以内。");
  }

  const mimeType = file.type || "image/png";
  const extension = mimeType.split("/")[1] || "png";

  return {
    dataUrl: await readFileAsDataUrl(file),
    mimeType,
    name: file.name?.trim() || `pasted-image.${extension}`,
    size: file.size,
  };
}

async function applySourceImage(file: File) {
  sourceImageError.value = "";
  noticeText.value = "";

  try {
    sourceImage.value = await createSourceImageState(file);
  } catch (error) {
    sourceImage.value = null;
    sourceImageError.value = error instanceof Error ? error.message : "图片读取失败，请重试。";
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

async function handleModelChange(value: string | number | null) {
  selectedModelId.value = typeof value === "string" ? value : null;
  followsDefaultModel.value = selectedModelId.value === defaultModel.value?.id;
  await appConfigStore.setSelectedTranslationModelId(selectedModelId.value);
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
    noticeText.value = "请先在设置窗口中启用至少一个模型。";
    return;
  }

  if (!hasSourceContent.value) {
    noticeText.value = "先输入文本或附加图片，再开始翻译。";
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
        sourceImage: sourceImage.value
          ? {
              dataUrl: sourceImage.value.dataUrl,
              mimeType: sourceImage.value.mimeType,
              name: sourceImage.value.name,
            }
          : null,
      },
    });
    resultWindowVisible.value = true;
  } catch (error) {
    noticeText.value = error instanceof Error ? error.message : "打开结果窗口失败。";
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

  sourceText.value = item.request.sourceText;
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
    }
    : null;
  sourceImageError.value = "";

  if (historyModel) {
    selectedModelId.value = historyModel.id;
    followsDefaultModel.value = historyModel.id === defaultModel.value?.id;
    await appConfigStore.setSelectedTranslationModelId(historyModel.id);
  }

  if (!historyModel) {
    noticeText.value = "当前没有可用模型，已恢复记录内容。";
    return;
  }

  translating.value = true;
  noticeText.value = "";

  try {
    await requestTranslationInResultWindow({
      modelId: historyModel.id,
      request: {
        sourceText: item.request.sourceText,
        sourceLanguage: requestedSourceLanguage,
        targetLanguage: requestedTargetLanguage,
        sourceImage: item.request.sourceImage ?? null,
      },
    });
    resultWindowVisible.value = true;
  } catch (error) {
    noticeText.value = error instanceof Error ? error.message : "加载最近记录失败。";
  } finally {
    translating.value = false;
  }
}

function clearAll() {
  sourceText.value = "";
  sourceImage.value = null;
  sourceImageError.value = "";
  noticeText.value = "";
}

function removeSourceImage() {
  sourceImage.value = null;
  sourceImageError.value = "";
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
      <div v-if="sourceImage"
        class="mb-2 flex items-center justify-between gap-2 rounded-[14px] border border-border/60 bg-[var(--app-surface-elevated)] px-3 py-2">
        <div class="min-w-0">
          <div class="truncate text-xs font-medium text-foreground">{{ sourceImage.name }}</div>
          <div class="mt-0.5 text-[11px] text-muted-foreground">{{ sourceImageSummary }}</div>
        </div>

        <n-button tertiary size="small" :disabled="translating" @click="removeSourceImage">移除</n-button>
      </div>

      <n-alert v-if="statusAlertText" class="mb-2" :type="statusAlertType" :show-icon="false">
        {{ statusAlertText }}
      </n-alert>

      <div
        class="flex min-h-0 flex-1 rounded-[16px] border border-border/60 bg-[var(--app-surface-elevated)] px-4 py-3">
        <textarea v-model="sourceText" spellcheck="false" aria-label="待翻译内容" :readonly="translating"
          placeholder="输入内容，或直接粘贴截图。"
          class="min-h-0 flex-1 resize-none border-none bg-transparent p-0 text-[15px] leading-7 text-foreground outline-none placeholder:text-muted-foreground/80"
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
                    <div
                      v-if="formatHistoryResolutionSummary(item)"
                      class="mt-2 text-[11px] leading-5 text-muted-foreground"
                    >
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

            <span class="hidden text-[11px] text-muted-foreground sm:inline">{{ currentModelLabel }}</span>
            <span class="hidden text-[11px] text-muted-foreground sm:inline">{{ preferences.translateShortcut ||
              DEFAULT_TRANSLATE_SHORTCUT }}</span>
            <n-button secondary size="medium" @click="handleToggleResultWindow">
              {{ resultToggleLabel }}
            </n-button>
            <n-button type="primary" size="medium" class="min-w-[116px]" :loading="translating"
              :disabled="!canTranslate" @click="handleTranslate">
              {{ translating ? "处理中" : "开始翻译" }}
            </n-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
