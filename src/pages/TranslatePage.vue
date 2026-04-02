<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import {
  ImagePlus,
  Languages,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-vue-next";
import { NAlert, NButton, NIcon, NSelect, NTag, type SelectOption } from "naive-ui";
import { defaultTargetLanguage, languageOptions } from "@/constants/languages";
import { useWindowSurfaceMode } from "@/composables/useWindowSurfaceMode";
import { useAppConfigStore } from "@/stores/appConfig";
import {
  openSettingsWindow,
  requestTranslationInResultWindow,
} from "@/services/window/windowManager";

interface SourceImageState {
  dataUrl: string;
  mimeType: string;
  name: string;
  size: number;
}

const maxPastedImageSize = 10 * 1024 * 1024;

const appConfigStore = useAppConfigStore();
const appWindow = getCurrentWindow();

const { defaultModel, enabledModels } = storeToRefs(appConfigStore);

const sourceText = ref("");
const targetLanguage = ref(defaultTargetLanguage);
const sourceImage = ref<SourceImageState | null>(null);
const sourceImageError = ref("");
const noticeText = ref("");
const translating = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

const targetLanguageOptions = computed<SelectOption[]>(() =>
  languageOptions
    .filter((option) => option.value !== "auto")
    .map((option) => ({
      label: option.label,
      value: option.value,
    })),
);
const hasSourceContent = computed(
  () => Boolean(sourceText.value.trim()) || Boolean(sourceImage.value),
);
const canTranslate = computed(
  () => Boolean(defaultModel.value) && hasSourceContent.value && Boolean(targetLanguage.value),
);
const sourceImageSummary = computed(() =>
  sourceImage.value ? `${sourceImage.value.name} · ${formatFileSize(sourceImage.value.size)}` : "",
);
const currentModelLabel = computed(() => defaultModel.value?.name ?? "未设置默认模型");
const statusAlertType = computed(() => (sourceImageError.value ? "error" : "info"));
const statusAlertText = computed(() => sourceImageError.value || noticeText.value);

useWindowSurfaceMode("default");

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

async function handleTranslate() {
  if (!defaultModel.value) {
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
      modelId: defaultModel.value.id,
      request: {
        sourceText: sourceText.value,
        sourceLanguage: "auto",
        targetLanguage: targetLanguage.value,
        sourceImage: sourceImage.value
          ? {
              dataUrl: sourceImage.value.dataUrl,
              mimeType: sourceImage.value.mimeType,
              name: sourceImage.value.name,
            }
          : null,
      },
    });
  } catch (error) {
    noticeText.value = error instanceof Error ? error.message : "打开结果窗口失败。";
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
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !translating.value) {
    event.preventDefault();
    void handleTranslate();
  }
}

function handleBarMouseDown() {
  void appWindow.startDragging();
}

function handleClose() {
  void appWindow.close();
}

if (typeof window !== "undefined") {
  useEventListener(window, "paste", (event) => {
    void handleImagePaste(event);
  });
}
</script>

<template>
  <div class="h-[100dvh] w-full overflow-hidden bg-transparent transition-all duration-300">
    <div class="flex h-full min-h-0 flex-col gap-4">
      <header
        class="flex items-center justify-between gap-3 px-3 py-3 sm:px-4"
        @mousedown.left="handleBarMouseDown"
      >
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <n-tag round :bordered="false" size="small" type="default">
            当前语言: 自动识别
          </n-tag>

          <div class="min-w-[188px] max-w-[260px]" @mousedown.stop>
            <n-select
              v-model:value="targetLanguage"
              :options="targetLanguageOptions"
              size="small"
              :disabled="translating"
              placeholder="目标语言"
            />
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-2" @mousedown.stop>
          <n-button type="primary" :loading="translating" :disabled="!canTranslate" @click="handleTranslate">
            <template #icon>
              <n-icon>
                <Sparkles />
              </n-icon>
            </template>
            {{ translating ? "处理中" : "翻译" }}
          </n-button>

          <n-button secondary @click="handleOpenSettings('models')">
            <template #icon>
              <n-icon>
                <Settings2 />
              </n-icon>
            </template>
            设置
          </n-button>

          <n-button quaternary circle @click="handleClose">
            <template #icon>
              <n-icon>
                <X />
              </n-icon>
            </template>
          </n-button>
        </div>
      </header>

      <section class=" flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5 sm:py-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <n-tag round :bordered="false" size="small" type="info">
              <template #icon>
                <n-icon>
                  <Languages />
                </n-icon>
              </template>
              文本
            </n-tag>
            <n-tag round :bordered="false" size="small" type="success">
              <template #icon>
                <n-icon>
                  <ImagePlus />
                </n-icon>
              </template>
              图片
            </n-tag>
            <n-tag round :bordered="false" size="small" type="default">
              结果窗口输出
            </n-tag>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <n-tag round size="small" :bordered="false" type="primary">
              {{ currentModelLabel }}
            </n-tag>
            <n-tag round size="small" :bordered="false" type="default">
              {{ enabledModels.length }} 个模型
            </n-tag>
          </div>
        </div>

        <div
          v-if="sourceImage"
          class="mt-4 overflow-hidden rounded-[24px] border border-border/70 bg-background/65 p-3"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-foreground">已附加图片</div>
              <div class="mt-1 text-xs text-muted-foreground">{{ sourceImageSummary }}</div>
            </div>

            <n-button tertiary size="small" @click="removeSourceImage">移除</n-button>
          </div>

          <img
            :src="sourceImage.dataUrl"
            :alt="sourceImage.name"
            class="mt-3 max-h-[160px] w-full rounded-[18px] object-contain"
          />
        </div>

        <n-alert
          v-if="statusAlertText"
          class="mt-4"
          :type="statusAlertType"
          :show-icon="false"
        >
          {{ statusAlertText }}
        </n-alert>

        <textarea
          v-model="sourceText"
          spellcheck="false"
          aria-label="待翻译内容"
          :readonly="translating"
          placeholder="输入要翻译的文字，或直接粘贴截图 / 图片。按 Ctrl + Enter 开始翻译。"
          class="mt-4 min-h-[200px] flex-1 resize-none rounded-[26px] border border-border/70 bg-background/55 px-4 py-4 text-[15px] leading-7 text-foreground outline-none transition-colors placeholder:text-muted-foreground/80 focus:border-primary/50"
          @keydown="handleSourceKeydown"
        />

        <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <input ref="fileInputRef" type="file" accept="image/*" class="hidden" @change="handleFileSelected" />

            <n-button secondary @click="triggerFilePicker">
              <template #icon>
                <n-icon>
                  <ImagePlus />
                </n-icon>
              </template>
              附加图片
            </n-button>

            <n-button secondary :disabled="!sourceImage || translating" @click="removeSourceImage">
              <template #icon>
                <n-icon>
                  <Trash2 />
                </n-icon>
              </template>
              移除图片
            </n-button>

            <n-button tertiary :disabled="translating" @click="clearAll">清空</n-button>
          </div>

          <div class="flex items-center gap-2 text-xs text-muted-foreground">
            <span>快捷键: Ctrl + Enter</span>
            <span class="h-1 w-1 rounded-full bg-border" />
            <span>{{ sourceText.length }} 字</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
