<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { Copy, X } from "lucide-vue-next";
import { NAlert, NButton, NIcon, NSkeleton, NTag } from "naive-ui";
import { resolveLanguageLabel } from "@/constants/languages";
import { useWindowSurfaceMode } from "@/composables/useWindowSurfaceMode";
import {
  formatTranslationResolutionSummary,
  formatTranslationResolutionTag,
} from "@/services/ai/translationResolutionFormatter";
import { useAppConfigStore } from "@/stores/appConfig";
import { useTranslationStore } from "@/stores/translation";
import {
  MAIN_WINDOW_LABEL,
  TRANSLATION_RESULT_PRESENT_EVENT,
  TRANSLATION_RESULT_READY_EVENT,
  TRANSLATION_RESULT_RUN_EVENT,
  TRANSLATION_RESULT_VISIBILITY_EVENT,
} from "@/services/window/windowManager";
import type { TranslationResultPresentPayload, TranslationWindowRunPayload } from "@/types/ai";

const appWindow = getCurrentWindow();
const appConfigStore = useAppConfigStore();
const translationStore = useTranslationStore();

const { currentModelName, currentRequest, currentResult, errorMessage, loading } = storeToRefs(translationStore);

const lastTargetLanguage = ref("");
const copyFeedback = ref("");

let unlistenRun: (() => void) | null = null;
let unlistenPresent: (() => void) | null = null;

useWindowSurfaceMode("default");

const displayedResult = computed(() => currentResult.value?.text ?? "");
const displayedUsage = computed(() => currentResult.value?.usage?.totalTokens ?? null);
const displayedModelName = computed(() => currentModelName.value || "翻译结果");
const resolutionSummary = computed(() =>
  formatTranslationResolutionSummary(currentRequest.value?.resolution),
);
const requestedTargetLabel = computed(() => {
  const requestedTarget =
    currentRequest.value?.resolution?.requestedTargetLanguage ??
    lastTargetLanguage.value;

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

  return resolvedTarget ? resolveLanguageLabel(resolvedTarget) : "未指定目标语言";
});
const autoTargetLabel = computed(() =>
  formatTranslationResolutionTag(currentRequest.value?.resolution),
);
const showStreamingSkeleton = computed(() => loading.value && !displayedResult.value);
const resultTextareaRef = ref<HTMLTextAreaElement | null>(null);

watch(displayedResult, async () => {
  await nextTick();

  if (!resultTextareaRef.value) {
    return;
  }

  resultTextareaRef.value.scrollTop = resultTextareaRef.value.scrollHeight;
});

async function runTranslation(payload: TranslationWindowRunPayload) {
  const modelConfig =
    appConfigStore.models.find((model) => model.id === payload.modelId) ?? appConfigStore.defaultModel;

  lastTargetLanguage.value = payload.request.targetLanguage;
  copyFeedback.value = "";

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
  copyFeedback.value = "";

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

async function handleCopy() {
  if (!displayedResult.value) {
    return;
  }

  await navigator.clipboard.writeText(displayedResult.value);
  copyFeedback.value = "已复制";
  window.setTimeout(() => {
    copyFeedback.value = "";
  }, 1500);
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
        <n-tag round :bordered="false" size="small" type="info">
          {{ autoTargetLabel || resolvedTargetLabel }}
        </n-tag>
        <n-tag
          v-if="autoTargetLabel && requestedTargetLabel"
          round
          :bordered="false"
          size="small"
          type="default"
        >
          请求: {{ requestedTargetLabel }}
        </n-tag>
        <n-tag v-if="displayedUsage" round :bordered="false" size="small" type="default">
          {{ displayedUsage }} tokens
        </n-tag>
      </div>

      <div class="flex shrink-0 items-center gap-1.5" @mousedown.stop>
        <n-button secondary size="small" :disabled="!displayedResult" @click="handleCopy">
          <template #icon>
            <n-icon>
              <Copy />
            </n-icon>
          </template>
          {{ copyFeedback || "复制" }}
        </n-button>

        <n-button quaternary circle size="small" @click="handleHide">
          <template #icon>
            <n-icon>
              <X />
            </n-icon>
          </template>
        </n-button>
      </div>
    </header>

    <div class="flex min-h-0 flex-1 flex-col px-4 py-4">
      <n-alert v-if="errorMessage" type="error" :show-icon="false">
        {{ errorMessage }}
      </n-alert>
      <n-alert
        v-if="resolutionSummary"
        class="mt-2"
        type="info"
        :show-icon="false"
      >
        {{ resolutionSummary }}
      </n-alert>

      <div
        v-if="showStreamingSkeleton"
        class="mt-2 flex min-h-0 flex-1 flex-col gap-3 rounded-[16px] border border-border/60 bg-[var(--app-surface-elevated)] px-4 py-4"
      >
        <n-skeleton text :repeat="1" height="16px" width="92%" />
        <n-skeleton text :repeat="1" height="16px" width="78%" />
        <n-skeleton text :repeat="1" height="16px" width="88%" />
        <n-skeleton text :repeat="1" height="16px" width="67%" />
      </div>

      <div
        v-else
        class="mt-2 flex min-h-0 flex-1 rounded-[16px] border border-border/60 bg-[var(--app-surface-elevated)] px-4 py-4"
      >
        <textarea
          ref="resultTextareaRef"
          :value="displayedResult"
          readonly
          aria-label="译文结果"
          :placeholder="loading ? '正在翻译，内容会实时出现在这里。' : '翻译结果会出现在这里。'"
          class="min-h-0 flex-1 resize-none border-none bg-transparent p-0 text-[15px] leading-7 text-foreground outline-none placeholder:text-muted-foreground/80"
        />
      </div>
    </div>
  </div>
</template>
