<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { NButton, NSelect, NTag, NCard, NText, NEmpty, NAlert, type SelectOption } from "naive-ui";
import { defaultSourceLanguage, defaultTargetLanguage, languageOptions } from "@/constants/languages";
import { useAppConfigStore } from "@/stores/appConfig";
import { useTranslationStore } from "@/stores/translation";
import type { TranslationHistoryItem } from "@/types/ai";

const router = useRouter();
const appConfigStore = useAppConfigStore();
const translationStore = useTranslationStore();

const { defaultModel, enabledModels } = storeToRefs(appConfigStore);
const { currentResult, currentModelName, errorMessage, history, loading } =
  storeToRefs(translationStore);

const sourceText = ref("");
const sourceLanguage = ref(defaultSourceLanguage);
const targetLanguage = ref(defaultTargetLanguage);
const showSecondary = ref(false);
const selectedModelId = ref<string | null>(null);

const modelOptions = computed<Array<SelectOption & { value: string }>>(() =>
  enabledModels.value.map((model) => ({
    label: `${model.name} · ${model.model}`,
    value: model.id,
  })),
);
const selectedModel = computed(
  () => enabledModels.value.find((model) => model.id === selectedModelId.value) ?? null,
);
const selectedModelSummary = computed(() =>
  selectedModel.value ? `${selectedModel.value.name} / ${selectedModel.value.model}` : "未选择",
);

const canTranslate = computed(
  () =>
    Boolean(selectedModel.value) && Boolean(sourceText.value.trim()) && Boolean(targetLanguage.value),
);
const sourceCharacterCount = computed(() => sourceText.value.length);
const historyPreview = computed(() => history.value.slice(0, 4));
const translatedText = computed(() => currentResult.value?.text ?? "");

watch(
  [enabledModels, defaultModel],
  ([models, fallbackModel]) => {
    if (models.length === 0) {
      selectedModelId.value = null;
      return;
    }

    const hasSelectedModel = models.some((model) => model.id === selectedModelId.value);

    if (hasSelectedModel) {
      return;
    }

    selectedModelId.value =
      fallbackModel && models.some((model) => model.id === fallbackModel.id)
        ? fallbackModel.id
        : models[0].id;
  },
  { immediate: true },
);

function clearAll() {
  sourceText.value = "";
  translationStore.clearResult();
}

function openModelSettings() {
  void router.push({ name: "models" });
}

function handleSourceKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && canTranslate.value && !loading.value) {
    event.preventDefault();
    void handleTranslate();
  }
}

function swapLanguages() {
  if (sourceLanguage.value === "auto") {
    sourceLanguage.value = targetLanguage.value;
    targetLanguage.value = "Chinese (Simplified)";
  } else {
    const nextSourceLanguage = targetLanguage.value;
    targetLanguage.value = sourceLanguage.value;
    sourceLanguage.value = nextSourceLanguage;
  }

  if (currentResult.value?.text) {
    sourceText.value = currentResult.value.text;
    translationStore.clearResult();
  }
}

function applyHistoryItem(item: TranslationHistoryItem) {
  sourceText.value = item.request.sourceText;
  sourceLanguage.value = item.request.sourceLanguage;
  targetLanguage.value = item.request.targetLanguage;
  translationStore.clearResult();
  showSecondary.value = false;
}

async function handleTranslate() {
  if (!canTranslate.value || !selectedModel.value) return;
  try {
    await translationStore.translate(
      {
        sourceText: sourceText.value,
        sourceLanguage: sourceLanguage.value,
        targetLanguage: targetLanguage.value,
      },
      selectedModel.value,
    );
  } catch (error) {
    // Error is handled in store
  }
}

async function copyResult() {
  if (!translatedText.value) return;
  await navigator.clipboard.writeText(translatedText.value);
}
</script>

<template>
  <div class="h-full flex flex-col gap-6 animate-in fade-in duration-300">
    <!-- Header Area -->
    <div class="flex flex-col gap-4 border-b border-border/50 pb-5 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <n-text depth="3" class="text-xs tracking-wider uppercase font-semibold">Translate</n-text>
        <h1 class="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">翻译</h1>
      </div>
      <div class="flex flex-wrap items-center gap-3 lg:justify-end">
        <n-tag v-if="selectedModel" type="primary" round bordered :style="{ padding: '0 12px' }">
          {{ selectedModel.name }}
        </n-tag>
        <n-tag v-else type="error" round bordered :style="{ padding: '0 12px' }">
          未启用模型
        </n-tag>
        <n-button text type="primary" size="small" @click="showSecondary = !showSecondary">
          {{ showSecondary ? "收起细节" : "更多信息" }}
        </n-button>
      </div>
    </div>

    <!-- Alert for Missing Model -->
    <n-alert v-if="!enabledModels.length" title="还没有可用的已启用模型" type="warning" class="rounded-xl">
      <div class="flex flex-col gap-3">
        <span>先去模型设置里添加并启用至少一个 OpenAI Compatible 模型，再回来选择并开始翻译。</span>
        <div>
          <n-button size="small" type="warning" secondary @click="openModelSettings">打开模型设置</n-button>
        </div>
      </div>
    </n-alert>

    <!-- Model Selection -->
    <div class="rounded-2xl border border-border/50 bg-card/40 p-4 shadow-sm backdrop-blur-md">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <n-text depth="3" class="text-xs tracking-wider uppercase font-semibold">模型选择</n-text>
          <div class="mt-1 text-sm text-muted-foreground">从已启用模型中单选，默认会优先选中默认模型。</div>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <n-tag size="small" round :bordered="false" type="info">
            {{ enabledModels.length }} 个已启用
          </n-tag>
          <n-select v-model:value="selectedModelId" :options="modelOptions" placeholder="选择翻译模型"
            :consistent-menu-width="false" :disabled="!enabledModels.length || loading"
            class="w-full sm:min-w-[260px] sm:w-auto" />
        </div>
      </div>
    </div>

    <!-- Language Selection -->
    <div
      class="flex items-center gap-4 bg-card/40 border border-border/50 rounded-2xl p-2 px-4 shadow-sm backdrop-blur-md">
      <n-select v-model:value="sourceLanguage" :options="(languageOptions as any)" placeholder="源语言" class="w-48"
        :consistent-menu-width="false" size="medium" />
      <n-button quaternary circle size="medium" @click="swapLanguages" :disabled="loading"
        class="transition-transform hover:rotate-180">
        <span class="text-lg">⇄</span>
      </n-button>
      <n-select v-model:value="targetLanguage" :options="(languageOptions.filter((o) => o.value !== 'auto') as any)"
        placeholder="目标语言" class="w-48" :consistent-menu-width="false" size="medium" />
    </div>

    <!-- Translation Panels -->
    <div class="grid gap-6 flex-1 xl:grid-cols-2">
      <!-- Source Panel -->
      <n-card class="h-full rounded-2xl shadow-sm border-border/50 bg-card/40 backdrop-blur-md" :bordered="true"
        content-style="padding: 0; display: flex; flex-direction: column; height: 100%;">
        <div class="px-5 py-3 border-b border-border/50 flex items-center justify-between bg-black/5 dark:bg-white/5">
          <n-text depth="2" class="font-medium text-sm">原文</n-text>
          <div class="flex items-center gap-4">
            <n-text depth="3" class="text-xs">{{ sourceCharacterCount }} 字</n-text>
            <n-button text size="tiny" @click="clearAll" class="text-xs">清空</n-button>
          </div>
        </div>
        <div class="flex-1 p-5">
          <textarea v-model="sourceText" spellcheck="false" aria-label="原文"
            placeholder="输入或粘贴要翻译的内容，保留原始换行。按 Ctrl + Enter 可直接翻译。"
            class="translation-editor h-full min-h-[320px] w-full resize-none rounded-xl bg-background/40 px-4 py-3 text-[15px] leading-relaxed text-foreground outline-none"
            @keydown="handleSourceKeydown" @mousedown.stop @pointerdown.stop />
        </div>
      </n-card>

      <!-- Target Panel -->
      <n-card class="h-full rounded-2xl shadow-sm border-border/50 bg-card/40 backdrop-blur-md" :bordered="true"
        content-style="padding: 0; display: flex; flex-direction: column; height: 100%;">
        <div class="px-5 py-3 border-b border-border/50 flex items-center bg-black/5 dark:bg-white/5">
          <n-text depth="2" class="font-medium text-sm">译文</n-text>
          <div class=" flex flex-wrap items-center gap-2 ml-2" v-if="currentResult">
            <n-tag v-if="currentModelName" size="small" :bordered="false">{{ currentModelName }}</n-tag>
            <n-tag size="small" type="info" :bordered="false">{{ currentResult.model }}</n-tag>
            <n-tag v-if="currentResult.usage?.totalTokens" size="small" type="success" :bordered="false">
              {{ currentResult.usage.totalTokens }} tokens
            </n-tag>
          </div>
          <div class="flex-1 flex justify-end">
            <n-button size="tiny" secondary type="primary" :disabled="!currentResult?.text" @click="copyResult">
              复制
            </n-button>
          </div>
        </div>

        <div class="flex-1 p-5 flex flex-col relative overflow-hidden min-h-[320px]">
          <n-alert v-if="errorMessage" type="error" :show-icon="false" class="mb-4">
            {{ errorMessage }}
          </n-alert>

          <template v-if="currentResult">
            <div class="min-h-0 flex-1">
              <textarea :value="translatedText" readonly aria-label="译文"
                class="translation-editor h-full min-h-[320px] w-full resize-none rounded-xl bg-background/40 px-4 py-3 text-[15px] leading-relaxed text-foreground outline-none"
                @mousedown.stop @pointerdown.stop />
            </div>
          </template>
          <template v-else>
            <div class="absolute inset-0 flex items-center justify-center">
              <n-empty description="译文会显示在这里" />
            </div>
          </template>
        </div>
      </n-card>
    </div>

    <!-- Bottom Actions -->
    <div class="flex items-center justify-between mt-2">
      <div class="flex gap-3">
        <n-tag size="small" round :bordered="false" class="px-3">模型：{{ selectedModel?.name ?? "未选择" }}</n-tag>
        <n-tag size="small" round :bordered="false" class="px-3">目标语言：{{ targetLanguage }}</n-tag>
        <n-tag v-if="history.length" size="small" type="info" round :bordered="false" class="px-3">最近记录：{{
          history.length }}
          条</n-tag>
      </div>
      <n-button type="primary" size="large" :loading="loading" :disabled="!canTranslate" @click="handleTranslate"
        class="px-8 font-medium rounded-full shadow-lg hover:shadow-primary/30 transition-shadow">
        {{ loading ? "翻译中..." : "开始翻译" }}
      </n-button>
    </div>

    <!-- Secondary Info (History & Stats) -->
    <div v-if="showSecondary"
      class="grid gap-6 pt-6 border-t border-border/50 xl:grid-cols-2 animate-in slide-in-from-top-4 duration-300">
      <n-card title="状态" size="small" class="rounded-2xl border-border/50 bg-card/30">
        <template #header-extra>
          <n-button text type="primary" size="small" @click="openModelSettings">管理模型</n-button>
        </template>
        <div class="space-y-4">
          <div>
            <n-text depth="3" class="text-xs">当前选择</n-text>
            <div class="mt-1 font-semibold">{{ selectedModelSummary }}
            </div>
          </div>
          <div>
            <n-text depth="3" class="text-xs">已启用模型</n-text>
            <div class="mt-1 font-semibold">{{ enabledModels.length }} 个</div>
          </div>
          <div>
            <n-text depth="3" class="text-xs">默认回退</n-text>
            <div class="mt-1 font-semibold">{{ defaultModel ? `${defaultModel.name} / ${defaultModel.model}` : "未配置" }}
            </div>
          </div>
          <div>
            <n-text depth="3" class="text-xs">输入规模</n-text>
            <div class="mt-1 font-semibold">{{ sourceCharacterCount }} 字符</div>
          </div>
        </div>
      </n-card>

      <n-card size="small" class="rounded-2xl border-border/50 bg-card/30">
        <template #header>
          <div class="flex items-center gap-2">
            <span>最近翻译</span>
            <n-tag size="small" type="info" round v-if="history.length">{{ history.length }} 条</n-tag>
          </div>
        </template>
        <div v-if="historyPreview.length" class="flex flex-col gap-3">
          <div v-for="item in historyPreview" :key="item.id"
            class="rounded-xl border border-border/50 bg-background/50 p-3 hover:bg-primary/5 hover:border-primary/30 transition cursor-pointer"
            @click="applyHistoryItem(item)">
            <div class="flex items-center justify-between">
              <span class="font-bold text-sm">{{ item.request.targetLanguage }}</span>
              <n-text depth="3" class="text-xs">{{ new Date(item.createdAt).toLocaleTimeString() }}</n-text>
            </div>
            <p class="mt-2 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {{ item.request.sourceText }}
            </p>
          </div>
        </div>
        <div v-else class="py-6 text-center">
          <n-text depth="3">还没有翻译记录。</n-text>
        </div>
      </n-card>
    </div>
  </div>
</template>

<style scoped>
.translation-editor,
.translation-output {
  user-select: text;
  -webkit-user-select: text;
  pointer-events: auto;
  overflow-y: auto;
  caret-color: rgb(var(--app-primary-rgb));
}

.translation-editor::placeholder {
  color: hsl(var(--muted-foreground));
}

.translation-editor::selection,
.translation-output::selection {
  background: rgba(var(--app-primary-rgb), 0.4);
  color: inherit;
}

.translation-editor::-moz-selection,
.translation-output::-moz-selection {
  background: rgba(var(--app-primary-rgb), 0.4);
  color: inherit;
}
</style>
