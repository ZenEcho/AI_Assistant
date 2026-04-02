<script setup lang="ts">
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import {
  NAlert,
  NButton,
  NTag,
  NInputNumber,
  NRadioGroup,
  NRadioButton,
  useMessage,
} from "naive-ui";
import {
  closeBehaviorOptions,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_TRANSLATE_SHORTCUT,
  MAX_HISTORY_LIMIT,
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
import {
  checkForGithubReleaseUpdate,
  GITHUB_RELEASES_URL,
  getCurrentAppVersion,
  type ReleaseCheckResult,
} from "@/services/app/updateService";
import type { CloseBehavior, ThemeMode } from "@/types/app";

const appConfigStore = useAppConfigStore();
const translationStore = useTranslationStore();
const { preferences } = storeToRefs(appConfigStore);
const { history } = storeToRefs(translationStore);
const message = useMessage();

async function handleThemeModeChange(value: ThemeMode) {
  await appConfigStore.setThemeMode(value);
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

// ────── 版本更新 ──────

const currentAppVersion = ref("");
const releaseCheckLoading = ref(false);
const releaseCheckError = ref("");
const releaseCheckResult = ref<ReleaseCheckResult | null>(null);

const currentVersionLabel = computed(() =>
  currentAppVersion.value ? `v${currentAppVersion.value}` : "读取中...",
);

const latestVersionLabel = computed(() => {
  const latestVersion = releaseCheckResult.value?.latestRelease.version;
  return latestVersion ? `v${latestVersion}` : "未检查";
});

const latestReleaseUrl = computed(
  () => releaseCheckResult.value?.latestRelease.htmlUrl ?? GITHUB_RELEASES_URL,
);

function formatErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return "未知错误";
}

async function loadCurrentAppVersion() {
  try {
    currentAppVersion.value = await getCurrentAppVersion();
  } catch (error) {
    console.error("Failed to resolve current app version", error);
  }
}

async function handleCheckGithubRelease(options?: { silentSuccess?: boolean }) {
  if (releaseCheckLoading.value) {
    return;
  }

  releaseCheckLoading.value = true;
  releaseCheckError.value = "";

  try {
    const result = await checkForGithubReleaseUpdate();
    releaseCheckResult.value = result;
    currentAppVersion.value = result.currentVersion;

    if (!options?.silentSuccess) {
      if (result.hasUpdate) {
        message.warning(`发现新版本 ${latestVersionLabel.value}`);
      } else {
        message.success("当前已经是 GitHub 最新版本。");
      }
    }
  } catch (error) {
    console.error("Failed to check GitHub release update", error);
    releaseCheckError.value = formatErrorMessage(error);

    if (!options?.silentSuccess) {
      message.error(`检查更新失败：${releaseCheckError.value}`);
    }
  } finally {
    releaseCheckLoading.value = false;
  }
}

async function handleOpenGithubReleases() {
  try {
    if (isTauri()) {
      await openUrl(latestReleaseUrl.value);
      return;
    }
    window.open(latestReleaseUrl.value, "_blank", "noopener,noreferrer");
  } catch (error) {
    console.error("Failed to open GitHub releases page", error);
    message.error(`打开 GitHub Releases 失败：${formatErrorMessage(error)}`);
  }
}

onMounted(() => {
  void loadCurrentAppVersion();
  void handleCheckGithubRelease({ silentSuccess: true });
});
</script>

<template>
  <div class="flex flex-col gap-5 pb-4">

    <!-- 外观 -->
    <section>
      <div class="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">外观</div>
      <div class="divide-y divide-border/40 rounded-[16px] border border-border/60 bg-[var(--app-surface-elevated)]">

        <!-- 主题模式 -->
        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <span class="text-[13px] font-medium text-foreground">主题</span>
          <n-radio-group
            :value="preferences.themeMode"
            size="small"
            @update:value="handleThemeModeChange"
          >
            <n-radio-button
              v-for="option in themeModeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </n-radio-button>
          </n-radio-group>
        </div>


      </div>
    </section>

    <!-- 行为 -->
    <section>
      <div class="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">行为</div>
      <div class="divide-y divide-border/40 rounded-[16px] border border-border/60 bg-[var(--app-surface-elevated)]">

        <!-- 关闭方式 -->
        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <span class="text-[13px] font-medium text-foreground">关闭方式</span>
          <n-radio-group
            :value="preferences.closeBehavior"
            size="small"
            @update:value="handleCloseBehaviorChange"
          >
            <n-radio-button
              v-for="option in closeBehaviorOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </n-radio-button>
          </n-radio-group>
        </div>

        <!-- 全局快捷键 -->
        <div class="flex flex-col gap-2 px-4 py-3">
          <div class="flex items-center justify-between gap-3">
            <span class="text-[13px] font-medium text-foreground">显示 / 隐藏窗口</span>
            <div class="flex items-center gap-1.5">
              <div
                class="min-w-[100px] cursor-pointer rounded-lg border px-3 py-1 text-center font-mono text-[12px] font-semibold select-none transition-all duration-150"
                :class="shortcutRecording
                  ? 'border-primary bg-primary/10 text-primary animate-pulse'
                  : 'border-border/60 bg-[var(--app-surface)] text-foreground hover:border-primary/40'"
                @click="!shortcutRecording && startRecording()"
              >
                {{ shortcutDisplayText }}
              </div>
              <n-button size="small" secondary @click="shortcutRecording ? stopRecording() : startRecording()">
                {{ shortcutRecording ? '取消' : '修改' }}
              </n-button>
              <n-button size="small" tertiary @click="handleResetShortcut">默认</n-button>
            </div>
          </div>
          <n-alert
            v-if="shortcutConflict"
            type="warning"
            title="快捷键冲突"
            closable
            @close="shortcutConflict = false; shortcutError = ''"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[13px]">{{ shortcutError }}</span>
              <n-button size="tiny" type="warning" :loading="shortcutRegistering" @click="handleForceApply">强制保存</n-button>
              <n-button size="tiny" secondary @click="startRecording">换一个</n-button>
            </div>
          </n-alert>
          <n-alert
            v-else-if="shortcutError"
            type="error"
            title="注册失败"
            closable
            @close="shortcutError = ''"
          >
            <span class="text-[13px]">{{ shortcutError }}</span>
          </n-alert>
        </div>

        <!-- 触发翻译快捷键 -->
        <div class="flex items-center justify-between gap-3 px-4 py-3">
          <span class="text-[13px] font-medium text-foreground">触发翻译</span>
          <div class="flex items-center gap-1.5">
            <div
              class="min-w-[100px] cursor-pointer rounded-lg border px-3 py-1 text-center font-mono text-[12px] font-semibold select-none transition-all duration-150"
              :class="translateShortcutRecording
                ? 'border-primary bg-primary/10 text-primary animate-pulse'
                : 'border-border/60 bg-[var(--app-surface)] text-foreground hover:border-primary/40'"
              @click="!translateShortcutRecording && startTranslateShortcutRecording()"
            >
              {{ translateShortcutDisplayText }}
            </div>
            <n-button
              size="small"
              secondary
              @click="translateShortcutRecording ? stopTranslateShortcutRecording() : startTranslateShortcutRecording()"
            >
              {{ translateShortcutRecording ? '取消' : '修改' }}
            </n-button>
            <n-button size="small" tertiary @click="handleResetTranslateShortcut">默认</n-button>
          </div>
        </div>
      </div>
    </section>

    <!-- 历史记录 -->
    <section>
      <div class="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">历史记录</div>
      <div class="divide-y divide-border/40 rounded-[16px] border border-border/60 bg-[var(--app-surface-elevated)]">
        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <span class="text-[13px] font-medium text-foreground">保留上限</span>
          <div class="flex items-center gap-3">
            <span class="text-[12px] text-muted-foreground">已有 {{ history.length }} 条</span>
            <n-input-number
              :value="preferences.historyLimit"
              :min="1"
              :max="MAX_HISTORY_LIMIT"
              :precision="0"
              size="small"
              class="w-28"
              @update:value="handleHistoryLimitChange"
            />
          </div>
        </div>
        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <span class="text-[13px] font-medium text-foreground">清空记录</span>
          <n-button size="small" type="error" secondary @click="handleClearHistory">清空</n-button>
        </div>
      </div>
    </section>

    <!-- 关于 -->
    <section>
      <div class="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">关于</div>
      <div class="divide-y divide-border/40 rounded-[16px] border border-border/60 bg-[var(--app-surface-elevated)]">
        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <span class="text-[13px] font-medium text-foreground">当前版本</span>
          <div class="flex items-center gap-2">
            <span class="font-mono text-[13px] text-muted-foreground">{{ currentVersionLabel }}</span>
            <n-button size="small" secondary :loading="releaseCheckLoading" @click="handleCheckGithubRelease()">
              {{ releaseCheckLoading ? '检查中' : '检查更新' }}
            </n-button>
          </div>
        </div>
        <template v-if="releaseCheckResult">
          <div class="flex items-center justify-between gap-4 px-4 py-3">
            <span class="text-[13px] font-medium text-foreground">最新版本</span>
            <div class="flex items-center gap-2">
              <n-tag :type="releaseCheckResult.hasUpdate ? 'warning' : 'success'" size="small" :bordered="false">
                {{ latestVersionLabel }}
              </n-tag>
              <n-button v-if="releaseCheckResult.hasUpdate" size="small" type="primary" @click="handleOpenGithubReleases">
                下载
              </n-button>
            </div>
          </div>
        </template>
        <template v-if="releaseCheckError">
          <div class="px-4 py-3">
            <n-alert type="error" title="检查更新失败" closable @close="releaseCheckError = ''">
              {{ releaseCheckError }}
            </n-alert>
          </div>
        </template>
      </div>
    </section>

    <div class="flex justify-end">
      <n-button size="small" secondary @click="handleResetAppearance">恢复默认偏好</n-button>
    </div>
  </div>
</template>
