<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { storeToRefs } from "pinia";
import {
  NAlert,
  NButton,
  NTag,
  NCard,
  NColorPicker,
  NText,
  NGrid,
  NGridItem,
  NInputNumber,
  useMessage,
} from "naive-ui";
import {
  closeBehaviorOptions,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_TRANSLATE_SHORTCUT,
  DEFAULT_THEME_COLOR,
  MAX_HISTORY_LIMIT,
  presetThemeColors,
  themeModeOptions,
} from "@/constants/app";
import { useAppConfigStore } from "@/stores/appConfig";
import { useTranslationStore } from "@/stores/translation";
import {
  registerGlobalShortcut,
  type ShortcutRegistrationResult,
} from "@/services/shortcut/globalShortcutService";
import {
  buildShortcutString,
  formatRecordedShortcut,
  isShortcutRecordComplete,
} from "@/services/shortcut/shortcutUtils";
import type { CloseBehavior, ThemeMode } from "@/types/app";
import { resolveThemeMode } from "@/utils/theme";

const appConfigStore = useAppConfigStore();
const translationStore = useTranslationStore();
const { preferences } = storeToRefs(appConfigStore);
const { history } = storeToRefs(translationStore);
const message = useMessage();

const currentThemeModeLabel = computed(() => {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolvedMode = resolveThemeMode(preferences.value.themeMode, prefersDark);

  return resolvedMode === "dark" ? "深色" : "浅色";
});

async function handleThemeModeChange(value: ThemeMode) {
  await appConfigStore.setThemeMode(value);
}

async function handleThemeColorChange(value: string) {
  await appConfigStore.setThemeColor(value);
}

async function handleCloseBehaviorChange(value: CloseBehavior) {
  await appConfigStore.setCloseBehavior(value);
}

async function handleHistoryLimitChange(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return;
  }

  await appConfigStore.setHistoryLimit(value);
}

async function handleClearHistory() {
  await translationStore.clearHistory();
  message.success("最近记录已清空。");
}

async function handleResetAppearance() {
  await appConfigStore.resetPreferences();
  message.success("偏好设置已恢复默认。");
}

// ────── 全局快捷键 ──────

const shortcutRecording = ref(false);
const recordedKeys = ref<string[]>([]);
const shortcutConflict = ref(false);
const shortcutError = ref("");
const shortcutRegistering = ref(false);
const translateShortcutRecording = ref(false);
const recordedTranslateKeys = ref<string[]>([]);

const shortcutDisplayText = computed(() => {
  if (shortcutRecording.value && recordedKeys.value.length > 0) {
    return recordedKeys.value.join("+");
  }

  if (shortcutRecording.value) {
    return "请按下快捷键组合…";
  }

  return preferences.value.globalShortcut || DEFAULT_GLOBAL_SHORTCUT;
});

const translateShortcutDisplayText = computed(() => {
  if (translateShortcutRecording.value && recordedTranslateKeys.value.length > 0) {
    return recordedTranslateKeys.value.join("+");
  }

  if (translateShortcutRecording.value) {
    return "请按下快捷键组合…";
  }

  return preferences.value.translateShortcut || DEFAULT_TRANSLATE_SHORTCUT;
});

function handleDocumentKeyDown(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();

  if (event.key === "Escape") {
    stopRecording();
    return;
  }

  const combo = buildShortcutString(event);
  const parts = combo.split("+");
  recordedKeys.value = parts;

  if (isShortcutRecordComplete(event, combo)) {
    removeRecordingListener();
    void applyShortcut(formatRecordedShortcut(combo), false);
  }
}

function handleTranslateDocumentKeyDown(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();

  if (event.key === "Escape") {
    stopTranslateShortcutRecording();
    return;
  }

  const combo = buildShortcutString(event);
  const parts = combo.split("+");
  recordedTranslateKeys.value = parts;

  if (isShortcutRecordComplete(event, combo)) {
    removeTranslateRecordingListener();
    void applyTranslateShortcut(formatRecordedShortcut(combo));
  }
}

function removeRecordingListener() {
  document.removeEventListener("keydown", handleDocumentKeyDown, true);
}

function removeTranslateRecordingListener() {
  document.removeEventListener("keydown", handleTranslateDocumentKeyDown, true);
}

function startRecording() {
  stopTranslateShortcutRecording();
  shortcutConflict.value = false;
  shortcutError.value = "";
  recordedKeys.value = [];
  shortcutRecording.value = true;
  document.addEventListener("keydown", handleDocumentKeyDown, true);
}

function stopRecording() {
  shortcutRecording.value = false;
  recordedKeys.value = [];
  removeRecordingListener();
}

function startTranslateShortcutRecording() {
  stopRecording();
  recordedTranslateKeys.value = [];
  translateShortcutRecording.value = true;
  document.addEventListener("keydown", handleTranslateDocumentKeyDown, true);
}

function stopTranslateShortcutRecording() {
  translateShortcutRecording.value = false;
  recordedTranslateKeys.value = [];
  removeTranslateRecordingListener();
}

async function applyShortcut(shortcut: string, force: boolean) {
  shortcutRegistering.value = true;
  shortcutConflict.value = false;
  shortcutError.value = "";

  try {
    const result: ShortcutRegistrationResult = await registerGlobalShortcut(shortcut);

    if (result.success) {
      await appConfigStore.setGlobalShortcut(shortcut);
      shortcutRecording.value = false;
      recordedKeys.value = [];
      message.success(`快捷键已设置为 ${shortcut}`);
    } else if (force) {
      // Registration failed but user chose to save anyway
      await appConfigStore.setGlobalShortcut(shortcut);
      shortcutRecording.value = false;
      recordedKeys.value = [];
      message.warning(`快捷键已保存为 ${shortcut}，但当前注册失败，下次启动时会重试`);
    } else if (result.conflict) {
      shortcutConflict.value = true;
      shortcutError.value = result.error ?? `快捷键 ${shortcut} 已被占用`;
      shortcutRecording.value = false;
      // Keep recordedKeys so "force" can reuse them
    } else {
      shortcutError.value = result.error ?? "注册快捷键失败";
      shortcutRecording.value = false;
      recordedKeys.value = [];
    }
  } finally {
    shortcutRegistering.value = false;
  }
}

async function handleForceApply() {
  const shortcut = recordedKeys.value.join("+") || preferences.value.globalShortcut;
  await applyShortcut(shortcut, true);
}

async function handleResetShortcut() {
  await applyShortcut(DEFAULT_GLOBAL_SHORTCUT, true);
  shortcutConflict.value = false;
  shortcutError.value = "";
}

async function applyTranslateShortcut(shortcut: string) {
  await appConfigStore.setTranslateShortcut(shortcut);
  translateShortcutRecording.value = false;
  recordedTranslateKeys.value = [];
  message.success(`开始翻译快捷键已设置为 ${shortcut}`);
}

async function handleResetTranslateShortcut() {
  await applyTranslateShortcut(DEFAULT_TRANSLATE_SHORTCUT);
}

onBeforeUnmount(() => {
  removeRecordingListener();
  removeTranslateRecordingListener();
});
</script>

<template>
  <div class="flex h-full flex-col gap-5">
    <div class="flex flex-col gap-3 border-b border-border/50 pb-4 md:flex-row md:items-start md:justify-between">
      <div>
        <n-text depth="3" class="text-xs tracking-wider uppercase font-semibold">App Settings</n-text>
        <h1 class="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">应用设置</h1>
        <p class="mt-2 text-sm text-muted-foreground max-w-2xl leading-relaxed">
          管理主题、快捷键、关闭行为和历史记录，其他窗口会同步跟随这里的配置。
        </p>
      </div>
      <div class="shrink-0">
        <n-button secondary @click="handleResetAppearance">恢复默认</n-button>
      </div>
    </div>

    <n-grid :x-gap="20" :y-gap="20" cols="1 l:2">
      <n-grid-item>
        <n-card class="h-full rounded-[16px] border-border/60 bg-[var(--app-surface-elevated)] shadow-none" :bordered="true">
          <template #header>
            <span class="text-lg font-bold">主题模式</span>
          </template>
          <p class="mb-5 text-sm text-muted-foreground">
            跟随系统或固定浅色、深色，修改后会同步到翻译窗和结果窗。
          </p>

          <div class="grid gap-4 sm:grid-cols-3">
            <div
              v-for="option in themeModeOptions"
              :key="option.value"
              class="relative flex flex-col items-start p-4 border rounded-xl cursor-pointer transition-all duration-200"
              :class="preferences.themeMode === option.value ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/50 bg-[var(--app-surface-soft)]'"
              @click="handleThemeModeChange(option.value)"
            >
              <div class="flex items-center justify-between w-full mb-2">
                <span class="font-bold">{{ option.label }}</span>
                <div
                  class="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors"
                  :class="preferences.themeMode === option.value ? 'border-primary' : 'border-muted-foreground'"
                >
                  <div v-if="preferences.themeMode === option.value" class="w-2 h-2 rounded-full bg-primary" />
                </div>
              </div>
              <span class="text-xs text-muted-foreground">
                {{ option.value === 'auto' ? '跟随操作系统' : `固定为${option.label}` }}
              </span>
            </div>
          </div>

          <div class="mt-5 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/10 px-4 py-3">
            <div>
              <div class="font-bold">当前生效：{{ currentThemeModeLabel }}</div>
            </div>
            <n-tag type="primary" size="small" :bordered="false">配置: {{ preferences.themeMode }}</n-tag>
          </div>
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card class="h-full rounded-[16px] border-border/60 bg-[var(--app-surface-elevated)] shadow-none" :bordered="true">
          <template #header>
            <span class="text-lg font-bold">主题色</span>
          </template>
          <p class="mb-5 text-sm text-muted-foreground">
            主按钮、输入焦点和菜单高亮都会跟随主题色变化。
          </p>

          <div class="flex items-center gap-4 mb-6">
            <n-color-picker
              :value="preferences.themeColor"
              :swatches="presetThemeColors"
              @update:value="handleThemeColorChange"
              class="w-full max-w-xs"
              size="large"
            />
          </div>

          <div class="mb-6 grid grid-cols-4 gap-3 sm:grid-cols-8">
            <n-button
              v-for="color in presetThemeColors"
              :key="color"
              tertiary
              class="!h-10 !w-full !rounded-xl !p-0 shadow-sm transition-transform duration-200 hover:scale-110"
              :style="{
                '--n-color': color,
                '--n-color-hover': color,
                '--n-color-pressed': color,
                '--n-color-focus': color,
                '--n-border': '1px solid rgba(0, 0, 0, 0.08)',
                '--n-border-hover': '1px solid rgba(0, 0, 0, 0.08)',
                '--n-border-pressed': '1px solid rgba(0, 0, 0, 0.08)',
                '--n-border-focus': '1px solid rgba(0, 0, 0, 0.08)',
                '--n-text-color': '#ffffff',
                '--n-text-color-hover': '#ffffff',
                '--n-text-color-pressed': '#ffffff',
                '--n-text-color-focus': '#ffffff',
                '--n-ripple-color': color,
              }"
              @click="handleThemeColorChange(color)"
            >
              <span
                v-if="preferences.themeColor === color"
                class="text-base font-semibold mix-blend-difference"
              >
                ✓
              </span>
            </n-button>
          </div>

          <div class="grid sm:grid-cols-2 gap-4">
            <div class="rounded-xl border border-border/60 bg-[var(--app-surface-soft)] p-4">
              <n-text depth="3" class="text-xs font-semibold uppercase">当前选择</n-text>
              <div class="mt-2 text-lg font-bold">{{ preferences.themeColor }}</div>
              <n-text depth="3" class="text-xs mt-1 block">默认值: {{ DEFAULT_THEME_COLOR }}</n-text>
            </div>

            <div class="rounded-xl border border-primary/20 bg-primary/10 p-4">
              <div class="flex items-center gap-3">
                <div class="h-10 w-10 shrink-0 rounded-xl shadow-md" :style="{ backgroundColor: preferences.themeColor }" />
                <div>
                  <div class="font-bold text-sm">当前主色</div>
                  <n-text depth="3" class="text-xs">实时应用到所有窗口</n-text>
                </div>
              </div>
            </div>
          </div>
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card class="h-full rounded-[16px] border-border/60 bg-[var(--app-surface-elevated)] shadow-none" :bordered="true">
          <template #header>
            <span class="text-lg font-bold">关闭行为</span>
          </template>
          <p class="mb-5 text-sm text-muted-foreground">
            设置关闭按钮是先询问、隐藏到托盘，还是直接退出。
          </p>

          <div class="grid gap-4">
            <div
              v-for="option in closeBehaviorOptions"
              :key="option.value"
              class="relative flex cursor-pointer flex-col rounded-xl border p-4 transition-all duration-200"
              :class="preferences.closeBehavior === option.value ? 'border-primary bg-primary/5' : 'border-border/60 bg-[var(--app-surface-soft)] hover:border-primary/50'"
              @click="handleCloseBehaviorChange(option.value)"
            >
              <div class="mb-2 flex items-center justify-between gap-3">
                <span class="font-bold">{{ option.label }}</span>
                <div
                  class="flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors"
                  :class="preferences.closeBehavior === option.value ? 'border-primary' : 'border-muted-foreground'"
                >
                  <div v-if="preferences.closeBehavior === option.value" class="h-2 w-2 rounded-full bg-primary" />
                </div>
              </div>
              <span class="text-xs leading-5 text-muted-foreground">
                {{ option.description }}
              </span>
            </div>
          </div>

          <div class="mt-5 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3">
            <div class="font-bold">
              当前默认：{{
                closeBehaviorOptions.find((option) => option.value === preferences.closeBehavior)?.label
              }}
            </div>
            <p class="mt-1 text-xs leading-5 text-muted-foreground">
              如果你选择“每次询问”，关闭时会弹出确认框；如果选择固定行为，将直接执行。
            </p>
          </div>
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card class="h-full rounded-[16px] border-border/60 bg-[var(--app-surface-elevated)] shadow-none" :bordered="true">
          <template #header>
            <span class="text-lg font-bold">最近记录</span>
          </template>
          <p class="mb-5 text-sm text-muted-foreground">
            最近记录和翻译缓存都会保存在本地，数量上限共用这里的设置，并支持完整恢复图片记录。
          </p>

          <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div class="rounded-xl border border-border/60 bg-[var(--app-surface-soft)] p-4">
              <n-text depth="3" class="text-xs font-semibold uppercase">保留上限</n-text>
              <div class="mt-3 max-w-[220px]">
                <n-input-number
                  :value="preferences.historyLimit"
                  :min="1"
                  :max="MAX_HISTORY_LIMIT"
                  :precision="0"
                  clearable
                  @update:value="handleHistoryLimitChange"
                />
              </div>
              <p class="mt-2 text-xs leading-5 text-muted-foreground">
                范围 1 - {{ MAX_HISTORY_LIMIT }}。超出上限的旧记录和缓存会自动裁剪。
              </p>
            </div>

            <n-button secondary type="error" @click="handleClearHistory">
              一键清空记录
            </n-button>
          </div>

          <div class="mt-6 grid gap-4 sm:grid-cols-2">
            <div class="rounded-xl border border-border/60 bg-[var(--app-surface-soft)] p-4">
              <n-text depth="3" class="text-xs font-semibold uppercase">当前已保存</n-text>
              <div class="mt-2 text-lg font-bold">{{ history.length }} 条</div>
            </div>

            <div class="rounded-xl border border-primary/20 bg-primary/10 p-4">
              <n-text depth="3" class="text-xs font-semibold uppercase">当前上限</n-text>
              <div class="mt-2 text-lg font-bold">{{ preferences.historyLimit }} 条</div>
            </div>
          </div>
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card class="h-full rounded-[16px] border-border/60 bg-[var(--app-surface-elevated)] shadow-none" :bordered="true">
          <template #header>
            <span class="text-lg font-bold">全局快捷键</span>
          </template>
          <p class="mb-5 text-sm text-muted-foreground">
            在后台或最小化时，可以用快捷键统一显示或隐藏已打开的应用窗口。
          </p>

          <div class="flex flex-col gap-4">
            <div class="rounded-xl border border-border/60 bg-[var(--app-surface-soft)] p-4">
              <n-text depth="3" class="text-xs font-semibold uppercase mb-3 block">当前快捷键</n-text>
              <div class="flex items-center gap-3">
                <div
                  class="flex-1 flex items-center justify-center rounded-xl border-2 border-dashed px-4 py-3 text-lg font-mono font-bold transition-all duration-200 cursor-pointer select-none"
                  :class="shortcutRecording ? 'border-primary bg-primary/10 text-primary animate-pulse' : 'border-border/60 bg-[var(--app-surface)] text-foreground hover:border-primary/50'"
                  @click="!shortcutRecording && startRecording()"
                >
                  {{ shortcutDisplayText }}
                </div>
                <n-button secondary size="small" @click="shortcutRecording ? stopRecording() : startRecording()">
                  {{ shortcutRecording ? '取消' : '修改' }}
                </n-button>
              </div>
              <p class="mt-2 text-xs leading-5 text-muted-foreground">
                点击上方区域或"修改"按钮开始录入，然后按下你想要的组合键（至少包含一个修饰键 + 一个普通键）。按 Esc 取消。
              </p>
            </div>

            <n-alert
              v-if="shortcutConflict"
              type="warning"
              title="快捷键冲突"
              closable
              @close="shortcutConflict = false; shortcutError = ''"
            >
              <div class="flex flex-col gap-2">
                <span>{{ shortcutError }}</span>
                <div class="flex items-center gap-2">
                  <n-button
                    size="small"
                    type="warning"
                    :loading="shortcutRegistering"
                    @click="handleForceApply"
                  >
                    强制设置
                  </n-button>
                  <n-button size="small" secondary @click="startRecording">
                    换一个
                  </n-button>
                </div>
              </div>
            </n-alert>

            <n-alert
              v-else-if="shortcutError && !shortcutConflict"
              type="error"
              title="注册失败"
              closable
              @close="shortcutError = ''"
            >
              {{ shortcutError }}
            </n-alert>
          </div>

          <div class="mt-5 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/10 px-4 py-3">
            <div>
              <div class="font-bold">生效中：{{ preferences.globalShortcut || DEFAULT_GLOBAL_SHORTCUT }}</div>
              <p class="text-xs text-muted-foreground mt-1">默认值：{{ DEFAULT_GLOBAL_SHORTCUT }}</p>
            </div>
            <n-button size="small" secondary @click="handleResetShortcut">
              恢复默认
            </n-button>
          </div>
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card class="h-full rounded-[16px] border-border/60 bg-[var(--app-surface-elevated)] shadow-none" :bordered="true">
          <template #header>
            <span class="text-lg font-bold">开始翻译快捷键</span>
          </template>
          <p class="mb-5 text-sm text-muted-foreground">
            在翻译输入框内按下该组合键，会直接触发“开始翻译”。
          </p>

          <div class="flex flex-col gap-4">
            <div class="rounded-xl border border-border/60 bg-[var(--app-surface-soft)] p-4">
              <n-text depth="3" class="text-xs font-semibold uppercase mb-3 block">当前快捷键</n-text>
              <div class="flex items-center gap-3">
                <div
                  class="flex-1 flex items-center justify-center rounded-xl border-2 border-dashed px-4 py-3 text-lg font-mono font-bold transition-all duration-200 cursor-pointer select-none"
                  :class="translateShortcutRecording ? 'border-primary bg-primary/10 text-primary animate-pulse' : 'border-border/60 bg-[var(--app-surface)] text-foreground hover:border-primary/50'"
                  @click="!translateShortcutRecording && startTranslateShortcutRecording()"
                >
                  {{ translateShortcutDisplayText }}
                </div>
                <n-button
                  secondary
                  size="small"
                  @click="translateShortcutRecording ? stopTranslateShortcutRecording() : startTranslateShortcutRecording()"
                >
                  {{ translateShortcutRecording ? '取消' : '修改' }}
                </n-button>
              </div>
              <p class="mt-2 text-xs leading-5 text-muted-foreground">
                点击上方区域或“修改”按钮开始录入，然后按下你想要的组合键。按 Esc 取消。
              </p>
            </div>
          </div>

          <div class="mt-5 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/10 px-4 py-3">
            <div>
              <div class="font-bold">生效中：{{ preferences.translateShortcut || DEFAULT_TRANSLATE_SHORTCUT }}</div>
              <p class="text-xs text-muted-foreground mt-1">默认值：{{ DEFAULT_TRANSLATE_SHORTCUT }}</p>
            </div>
            <n-button size="small" secondary @click="handleResetTranslateShortcut">
              恢复默认
            </n-button>
          </div>
        </n-card>
      </n-grid-item>
    </n-grid>
  </div>
</template>
