<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { storeToRefs } from "pinia";
import { X } from "lucide-vue-next";
import { NAlert, NButton, NIcon, NImage, NInput, NSkeleton, NTag } from "naive-ui";
import { resolveLanguageLabel } from "@/constants/languages";
import { useWindowSurfaceMode } from "@/composables/useWindowSurfaceMode";
import {
  formatTranslationResolutionSummary,
  formatTranslationResolutionTag,
} from "@/services/ai/translationResolutionFormatter";
import {
  MAIN_WINDOW_LABEL,
  TRANSLATION_RESULT_PRESENT_EVENT,
  TRANSLATION_RESULT_READY_EVENT,
  TRANSLATION_RESULT_RUN_EVENT,
  TRANSLATION_RESULT_VISIBILITY_EVENT,
} from "@/services/window/windowManager";
import { useAppConfigStore } from "@/stores/appConfig";
import { useTranslationStore } from "@/stores/translation";
import type { TranslationResultPresentPayload, TranslationWindowRunPayload } from "@/types/ai";

const appWindow = getCurrentWindow();
const appConfigStore = useAppConfigStore();
const translationStore = useTranslationStore();

const { currentModelName, currentRequest, currentResult, errorMessage, loading } = storeToRefs(
  translationStore,
);

const lastTargetLanguage = ref("");

let unlistenRun: (() => void) | null = null;
let unlistenPresent: (() => void) | null = null;

useWindowSurfaceMode("default");

const displayedResult = computed(() => currentResult.value?.text ?? "");
const isImageMode = computed(() => currentResult.value?.mode === "image");
const displayedImageTranslation = computed(() => currentResult.value?.imageTranslation ?? null);
const displayedUsage = computed(() => currentResult.value?.usage?.totalTokens ?? null);
const displayedModelName = computed(() => currentModelName.value || "翻译结果");
const resultDisplayMode = shallowRef<"image" | "text">("image");
const showImagePreview = computed(
  () => isImageMode.value && displayedImageTranslation.value && resultDisplayMode.value === "image",
);
const resultDisplayToggleLabel = computed(() =>
  resultDisplayMode.value === "image" ? "查看文本" : "查看图片",
);

watch(isImageMode, (next) => {
  resultDisplayMode.value = next ? "image" : "text";
});

function handleToggleResultDisplay() {
  resultDisplayMode.value = resultDisplayMode.value === "image" ? "text" : "image";
}
const resolutionSummary = computed(() =>
  formatTranslationResolutionSummary(currentRequest.value?.resolution),
);
const requestedTargetLabel = computed(() => {
  const requestedTarget =
    currentRequest.value?.resolution?.requestedTargetLanguage ?? lastTargetLanguage.value;

  if (!requestedTarget) {
    return "";
  }

  return resolveLanguageLabel(requestedTarget);
});
const resolvedTargetLabel = computed(() => {
  const resolvedTarget =
    currentRequest.value?.resolution?.resolvedTargetLanguage ??
    currentRequest.value?.targetLanguage ??
    lastTargetLanguage.value;

  return resolvedTarget ? resolveLanguageLabel(resolvedTarget) : "暂无翻译";
});
const autoTargetLabel = computed(() =>
  formatTranslationResolutionTag(currentRequest.value?.resolution),
);
const showStreamingSkeleton = computed(() => loading.value && !displayedResult.value);
const imagePreviewBoxStyle = computed(() => {
  const render = displayedImageTranslation.value?.render;

  if (!render?.width || !render?.height) {
    return {

    };
  }

  return {
    aspectRatio: `${render.width} / ${render.height}`,

  };
});
const textInputProps = {
  rows: 6,
  style: {
    height: "100%",
  },
} as const;

async function runTranslation(payload: TranslationWindowRunPayload) {
  const modelConfig =
    appConfigStore.models.find((model) => model.id === payload.modelId) ?? appConfigStore.defaultModel;

  lastTargetLanguage.value = payload.request.targetLanguage;

  if (!modelConfig) {
    translationStore.clearResult();
    return;
  }

  await appWindow.show();
  await appWindow.unminimize();
  await appWindow.emitTo(MAIN_WINDOW_LABEL, TRANSLATION_RESULT_VISIBILITY_EVENT, {
    visible: true,
  });

  try {
    await translationStore.translate(payload.request, modelConfig);
  } catch {
    // Store keeps the visible error state.
  }
}

async function presentTranslationResult(payload: TranslationResultPresentPayload) {
  lastTargetLanguage.value = payload.request?.targetLanguage ?? "";

  await appWindow.show();
  await appWindow.unminimize();
  await appWindow.emitTo(MAIN_WINDOW_LABEL, TRANSLATION_RESULT_VISIBILITY_EVENT, {
    visible: true,
  });

  translationStore.presentResult(payload.result, payload.modelName, payload.request ?? null);
}

function handleBarMouseDown() {
  void appWindow.startDragging();
}

async function handleHide() {
  await appWindow.hide();
  await appWindow.emitTo(MAIN_WINDOW_LABEL, TRANSLATION_RESULT_VISIBILITY_EVENT, {
    visible: false,
  });
}

onMounted(async () => {
  unlistenRun = await appWindow.listen<TranslationWindowRunPayload>(
    TRANSLATION_RESULT_RUN_EVENT,
    (event) => {
      void runTranslation(event.payload);
    },
  );

  unlistenPresent = await appWindow.listen<TranslationResultPresentPayload>(
    TRANSLATION_RESULT_PRESENT_EVENT,
    (event) => {
      void presentTranslationResult(event.payload);
    },
  );

  await appWindow.emitTo(MAIN_WINDOW_LABEL, TRANSLATION_RESULT_READY_EVENT);
});

onBeforeUnmount(() => {
  unlistenRun?.();
  unlistenPresent?.();
});
</script>

<template>
  <div class="flex h-[100dvh] w-full min-h-0 flex-col overflow-hidden bg-[var(--app-surface)] text-foreground">
    <header
      class="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3"
      @mousedown.left="handleBarMouseDown"
    >
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <div class="truncate text-sm font-semibold text-foreground">
          {{ displayedModelName }}
        </div>
        <NTag round :bordered="false" size="small" type="info">
          {{ autoTargetLabel || resolvedTargetLabel }}
        </NTag>
        <NTag
          v-if="autoTargetLabel && requestedTargetLabel"
          round
          :bordered="false"
          size="small"
          type="default"
        >
          请求: {{ requestedTargetLabel }}
        </NTag>
        <NTag v-if="displayedUsage" round :bordered="false" size="small" type="default">
          {{ displayedUsage }} tokens
        </NTag>
      </div>

      <div class="flex shrink-0 items-center gap-1.5" @mousedown.stop>
        <NButton quaternary circle size="small" @click="handleHide">
          <template #icon>
            <NIcon>
              <X />
            </NIcon>
          </template>
        </NButton>
      </div>
    </header>

    <div class="flex min-h-0 flex-1 flex-col px-4 py-4">
      <NAlert v-if="errorMessage" type="error" :show-icon="false">
        {{ errorMessage }}
      </NAlert>
      <NAlert
        v-if="resolutionSummary"
        class="mt-2"
        type="info"
        :show-icon="false"
      >
        {{ resolutionSummary }}
      </NAlert>

      <div
        v-if="showStreamingSkeleton"
        class="mt-2 flex min-h-0 flex-1 flex-col gap-3 rounded-[16px] border border-border/60 bg-[var(--app-surface-elevated)] px-4 py-4"
      >
        <NSkeleton text :repeat="1" height="16px" width="92%" />
        <NSkeleton text :repeat="1" height="16px" width="78%" />
        <NSkeleton text :repeat="1" height="16px" width="88%" />
        <NSkeleton text :repeat="1" height="16px" width="67%" />
      </div>

      <div
        v-else
        class="mt-2 flex min-h-0 flex-1 flex-col gap-4 rounded-[16px] border border-border/60 bg-[var(--app-surface-elevated)] px-4 py-4"
      >
        <template v-if="isImageMode && displayedImageTranslation">
          <div
            data-testid="result-page-display-toolbar"
            class="flex items-center justify-between gap-3 rounded-[12px] border border-border/60 bg-[var(--app-surface)] px-3 py-2"
          >
            <div class="min-w-0 flex flex-wrap items-center gap-1.5">
              <NTag size="small" round :bordered="false" type="info">图片翻译</NTag>
            </div>
            <NButton
              data-testid="result-page-display-toggle"
              tertiary
              size="small"
              @click="handleToggleResultDisplay"
            >
              {{ resultDisplayToggleLabel }}
            </NButton>
          </div>

          <div
            v-if="showImagePreview"
            data-testid="image-translation-preview-section"
            class="flex min-h-0 flex-1 flex-col gap-2"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="text-[12px] font-medium text-foreground">翻译后的图片</div>
              <NTag size="small" round :bordered="false" type="info">可预览</NTag>
            </div>
            <div
              class="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[12px] border border-border/60 bg-[var(--app-surface)] p-3"
              :style="imagePreviewBoxStyle"
            >
              <NImage
                data-testid="image-translation-preview"
                :src="displayedImageTranslation.render.imageDataUrl"
                alt="Translated image preview"
                object-fit="contain"
                class="block"
                preview-disabled
              />
            </div>
          </div>

          <div
            v-else
            data-testid="image-translation-text-section"
            class="flex min-h-0 flex-1 flex-col gap-2"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="text-[12px] font-medium text-foreground">识别后的译文文本</div>
              <NTag size="small" round :bordered="false" type="default">可复制</NTag>
            </div>
            <NInput
              class="min-h-0 flex-1"
              data-testid="image-translation-text"
              :value="displayedResult"
              type="textarea"
              readonly
              aria-label="Translated text"
              :input-props="textInputProps"
              :placeholder="loading ? '正在翻译…' : '翻译结果将在此显示。'"
            />
          </div>
        </template>

        <div
          v-else
          data-testid="text-translation-section"
          class="flex min-h-0 flex-1 flex-col gap-2"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="text-[12px] font-medium text-foreground">译文</div>
            <NTag size="small" round :bordered="false" type="default">可复制</NTag>
          </div>
          <NInput
            class="min-h-0 flex-1"
            data-testid="image-translation-text"
            :value="displayedResult"
            type="textarea"
            readonly
            aria-label="Translated text"
            :input-props="textInputProps"
            :placeholder="loading ? '正在翻译…' : '翻译结果将在此显示。'"
          />
        </div>
      </div>
    </div>
  </div>
</template>
