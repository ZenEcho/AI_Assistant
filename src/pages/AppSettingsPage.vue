<script setup lang="ts">
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import {
  NAlert,
  NButton,
  NInput,
  NInputNumber,
  NRadioGroup,
  NRadioButton,
  NSelect,
  NSwitch,
  NTag,
  type SelectOption,
  useMessage,
} from "naive-ui";
import {
  closeBehaviorOptions,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_TRANSLATE_SHORTCUT,
  MAX_HISTORY_LIMIT,
  SYSTEM_INPUT_ACTION_SHORTCUTS,
  SYSTEM_INPUT_ACTION_SHORTCUT_HINT,
  systemInputCaptureModeOptions,
  systemInputTriggerModeOptions,
  systemInputWritebackModeOptions,
  themeModeOptions,
} from "@/constants/app";
import {
  sourceLanguageOptions as translationSourceLanguageOptionList,
  targetLanguageOptions as translationTargetLanguageOptionList,
} from "@/constants/languages";
import { useAppConfigStore } from "@/stores/appConfig";
import { useSystemInputStore } from "@/stores/systemInput";
import { useTranslationStore } from "@/stores/translation";
import {
  formatSystemInputPermissionState,
  parseSystemInputAppList,
  stringifySystemInputAppList,
} from "@/services/systemInput/modeFormatter";
import {
  registerGlobalShortcut,
  registerNamedShortcut,
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
import { createLogger } from "@/services/logging/logger";
import type { CloseBehavior, ThemeMode } from "@/types/app";
import type { SystemInputConfig } from "@/types/systemInput";

const appConfigStore = useAppConfigStore();
const systemInputStore = useSystemInputStore();
const translationStore = useTranslationStore();
const { preferences } = storeToRefs(appConfigStore);
const {
  status: systemInputStatus,
  lastError: systemInputLastError,
  lastWritebackError: systemInputLastWritebackError,
} = storeToRefs(systemInputStore);
const { history } = storeToRefs(translationStore);
const message = useMessage();
const logger = createLogger({
  source: "page",
  category: "settings",
});

async function handleThemeModeChange(value: ThemeMode) {
  await appConfigStore.setThemeMode(value);
}

async function handleCloseBehaviorChange(value: CloseBehavior) {
  await appConfigStore.setCloseBehavior(value);
}

const autoLaunchSaving = ref(false);
const autoLaunchSyncing = ref(false);

async function handleLaunchAtStartupChange(value: boolean) {
  if (autoLaunchSaving.value) {
    return;
  }

  autoLaunchSaving.value = true;

  try {
    const enabled = await appConfigStore.setLaunchAtStartup(value);
    message.success(enabled ? "已开启开机自启动。" : "已关闭开机自启动。");
  } catch (error) {
    await logger.error("settings.auto-launch.update-failed", "更新开机自启动设置失败", {
      errorStack: error instanceof Error ? error.stack : String(error),
    });
    message.error(`设置开机自启动失败：${formatErrorMessage(error)}`);
    void syncLaunchAtStartupPreference({ silent: true });
  } finally {
    autoLaunchSaving.value = false;
  }
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

const translationSourceLanguageOptions = computed<SelectOption[]>(() =>
  translationSourceLanguageOptionList.map((option) => ({
    label: option.label,
    value: option.value,
  })),
);
const translationTargetLanguageOptions = computed<SelectOption[]>(() =>
  translationTargetLanguageOptionList.map((option) => ({
    label: option.label,
    value: option.value,
  })),
);
const systemInputTargetLanguageOptions = computed<SelectOption[]>(() =>
  translationTargetLanguageOptionList.map((option) => ({
    label: option.label,
    value: option.value,
  })),
);
const systemInputBlacklistText = ref("");
const systemInputWhitelistText = ref("");
const systemInputPermissionLabel = computed(() =>
  formatSystemInputPermissionState(systemInputStatus.value.permissionState),
);
const systemInputStatusType = computed(() =>
  systemInputLastWritebackError.value || systemInputStatus.value.lastError
    ? "warning"
    : systemInputStatus.value.nativeReady
      ? "success"
      : "warning",
);
const systemInputStatusText = computed(() => {
  if (systemInputStatus.value.nativeReady) {
    return `原生监听已就绪，运行平台：${systemInputStatus.value.platform}；当前会优先尝试原生文本获取与原生替换，失败后回退到模拟输入和剪贴板。`;
  }

  return systemInputStatus.value.lastError || "原生监听尚未就绪。";
});
const systemInputTargetAppText = computed(() => {
  const targetApp = systemInputStatus.value.lastTargetApp;
  if (!targetApp) {
    return "";
  }

  return (
    targetApp.appName
    || targetApp.processName
    || targetApp.windowTitle
    || targetApp.bundleId
    || ""
  );
});

const systemInputActionShortcutDefinitions = [
  {
    field: "translateSelectionShortcut",
    id: "system-input-translate-selection",
    label: "翻译选中内容",
    description: "用于外部应用里的选中文本翻译，可选自动覆盖原文。",
    defaultValue: SYSTEM_INPUT_ACTION_SHORTCUTS.translateSelection,
    run: async () => {
      await systemInputStore.translateSelectedTextFromShortcut();
    },
  },
  {
    field: "translateClipboardShortcut",
    id: "system-input-translate-clipboard",
    label: "翻译剪贴板",
    description: "读取剪贴板文本并生成译文，便于后续粘贴。",
    defaultValue: SYSTEM_INPUT_ACTION_SHORTCUTS.translateClipboard,
    run: async () => {
      await systemInputStore.translateClipboardTextFromShortcut();
    },
  },
  {
    field: "pasteLastTranslationShortcut",
    id: "system-input-paste-last-translation",
    label: "粘贴上次译文",
    description: "把最近一次快捷键翻译得到的译文粘贴到当前输入框。",
    defaultValue: SYSTEM_INPUT_ACTION_SHORTCUTS.pasteLastTranslation,
    run: async () => {
      await systemInputStore.pasteLastTranslationFromShortcut();
    },
  },
  {
    field: "toggleEnabledShortcut",
    id: "system-input-toggle-enabled",
    label: "开关系统输入增强",
    description: "快速开启或关闭系统输入增强，并弹出系统通知。",
    defaultValue: SYSTEM_INPUT_ACTION_SHORTCUTS.toggleEnabled,
    run: async () => {
      await systemInputStore.toggleEnabledFromShortcut();
    },
  },
] as const;

type SystemInputActionShortcutField = typeof systemInputActionShortcutDefinitions[number]["field"];

watch(
  () => preferences.value.systemInput.appBlacklist,
  (value) => {
    const nextValue = stringifySystemInputAppList(value);

    if (systemInputBlacklistText.value !== nextValue) {
      systemInputBlacklistText.value = nextValue;
    }
  },
  { immediate: true },
);

watch(
  () => preferences.value.systemInput.appWhitelist,
  (value) => {
    const nextValue = stringifySystemInputAppList(value);

    if (systemInputWhitelistText.value !== nextValue) {
      systemInputWhitelistText.value = nextValue;
    }
  },
  { immediate: true },
);

async function patchSystemInputConfig(partial: Partial<SystemInputConfig>) {
  await appConfigStore.updateSystemInputConfig(partial);
  await systemInputStore.syncConfigToNative();
}

async function patchTranslationPreferences(
  partial: Partial<typeof preferences.value.translation>,
) {
  await appConfigStore.updateTranslationPreferences(partial);
}

const systemInputShortcutRecordingField = ref<SystemInputActionShortcutField | null>(null);
const recordedSystemInputShortcutKeys = ref<string[]>([]);
const systemInputShortcutRegistering = ref(false);

function resolveSystemInputShortcutDefinition(field: SystemInputActionShortcutField) {
  const definition = systemInputActionShortcutDefinitions.find((item) => item.field === field);

  if (!definition) {
    throw new Error(`Unknown system input shortcut field: ${field}`);
  }

  return definition;
}

function resolveSystemInputShortcutValue(field: SystemInputActionShortcutField) {
  return preferences.value.systemInput[field];
}

function resolveSystemInputShortcutDisplayText(field: SystemInputActionShortcutField) {
  if (
    systemInputShortcutRecordingField.value === field &&
    recordedSystemInputShortcutKeys.value.length > 0
  ) {
    return recordedSystemInputShortcutKeys.value.join("+");
  }

  if (systemInputShortcutRecordingField.value === field) {
    return "请按下快捷键组合…";
  }

  return resolveSystemInputShortcutValue(field);
}

function removeSystemInputShortcutRecordingListener() {
  document.removeEventListener("keydown", handleSystemInputShortcutDocumentKeyDown, true);
}

function stopSystemInputShortcutRecording() {
  systemInputShortcutRecordingField.value = null;
  recordedSystemInputShortcutKeys.value = [];
  removeSystemInputShortcutRecordingListener();
}

function startSystemInputShortcutRecording(field: SystemInputActionShortcutField) {
  stopRecording();
  stopTranslateShortcutRecording();
  recordedSystemInputShortcutKeys.value = [];
  systemInputShortcutRecordingField.value = field;
  document.addEventListener("keydown", handleSystemInputShortcutDocumentKeyDown, true);
}

async function registerSystemInputActionShortcut(
  field: SystemInputActionShortcutField,
  shortcut: string,
) {
  const definition = resolveSystemInputShortcutDefinition(field);
  return await registerNamedShortcut(definition.id, shortcut, definition.run);
}

async function applySystemInputShortcut(
  field: SystemInputActionShortcutField,
  shortcut: string,
) {
  systemInputShortcutRegistering.value = true;

  try {
    const result = await registerSystemInputActionShortcut(field, shortcut);

    if (!result.success) {
      message.error(result.error ?? `注册快捷键 ${shortcut} 失败。`);
      stopSystemInputShortcutRecording();
      return;
    }

    await patchSystemInputConfig({
      [field]: shortcut,
    } as Partial<SystemInputConfig>);

    stopSystemInputShortcutRecording();
    message.success(`${resolveSystemInputShortcutDefinition(field).label} 已设置为 ${shortcut}`);
  } finally {
    systemInputShortcutRegistering.value = false;
  }
}

async function handleResetSystemInputShortcut(field: SystemInputActionShortcutField) {
  await applySystemInputShortcut(field, resolveSystemInputShortcutDefinition(field).defaultValue);
}

async function handleSystemInputBlacklistBlur() {
  await patchSystemInputConfig({
    appBlacklist: parseSystemInputAppList(systemInputBlacklistText.value),
  });
}

async function handleSystemInputWhitelistBlur() {
  await patchSystemInputConfig({
    appWhitelist: parseSystemInputAppList(systemInputWhitelistText.value),
  });
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

function handleSystemInputShortcutDocumentKeyDown(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();

  if (event.key === "Escape") {
    stopSystemInputShortcutRecording();
    return;
  }

  const field = systemInputShortcutRecordingField.value;

  if (!field) {
    stopSystemInputShortcutRecording();
    return;
  }

  const combo = buildShortcutString(event);
  recordedSystemInputShortcutKeys.value = combo.split("+");

  if (isShortcutRecordComplete(event, combo)) {
    removeSystemInputShortcutRecordingListener();
    void applySystemInputShortcut(field, formatRecordedShortcut(combo));
  }
}

function removeRecordingListener() {
  document.removeEventListener("keydown", handleDocumentKeyDown, true);
}

function removeTranslateRecordingListener() {
  document.removeEventListener("keydown", handleTranslateDocumentKeyDown, true);
}

function startRecording() {
  stopSystemInputShortcutRecording();
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
  stopSystemInputShortcutRecording();
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
  removeSystemInputShortcutRecordingListener();
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
    await logger.warn("app.version.resolve-failed", "读取当前应用版本失败", {
      category: "app",
      errorStack: error instanceof Error ? error.stack : String(error),
    });
  }
}

async function syncLaunchAtStartupPreference(options?: { silent?: boolean }) {
  if (!isTauri() || autoLaunchSyncing.value) {
    return;
  }

  autoLaunchSyncing.value = true;

  try {
    await appConfigStore.syncLaunchAtStartupPreference();
  } catch (error) {
    await logger.warn("settings.auto-launch.sync-failed", "同步开机自启动设置失败", {
      errorStack: error instanceof Error ? error.stack : String(error),
    });

    if (!options?.silent) {
      message.error(`读取开机自启动状态失败：${formatErrorMessage(error)}`);
    }
  } finally {
    autoLaunchSyncing.value = false;
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
    await logger.error("app.update.check-failed", "检查 GitHub 更新失败", {
      category: "app",
      errorStack: error instanceof Error ? error.stack : String(error),
    });
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
    await logger.error("app.update.open-release-failed", "打开 GitHub Releases 页面失败", {
      category: "app",
      errorStack: error instanceof Error ? error.stack : String(error),
    });
    message.error(`打开 GitHub Releases 失败：${formatErrorMessage(error)}`);
  }
}

onMounted(() => {
  void systemInputStore.refreshStatusFromNative();
  void syncLaunchAtStartupPreference({ silent: true });
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

        <div class="grid gap-3 px-4 py-3 lg:grid-cols-2">
          <label class="rounded-xl border border-border/50 bg-[var(--app-surface)] px-3 py-3">
            <div class="text-[13px] font-medium text-foreground">主翻译默认源语言</div>
            <div class="mt-1 text-[12px] text-muted-foreground">
              主翻译窗口每次打开时默认使用的源语言。
            </div>
            <n-select
              data-testid="translation-default-source-language"
              :value="preferences.translation.sourceLanguage"
              :options="translationSourceLanguageOptions"
              size="small"
              class="mt-3"
              @update:value="typeof $event === 'string' && patchTranslationPreferences({ sourceLanguage: $event })"
            />
          </label>

          <label class="rounded-xl border border-border/50 bg-[var(--app-surface)] px-3 py-3">
            <div class="text-[13px] font-medium text-foreground">主翻译默认目标语言</div>
            <div class="mt-1 text-[12px] text-muted-foreground">
              选择“自动目标”后，会优先翻译到系统语言；如果原文本身就是系统语言，则改为英语。
            </div>
            <n-select
              data-testid="translation-default-target-language"
              :value="preferences.translation.targetLanguage"
              :options="translationTargetLanguageOptions"
              size="small"
              class="mt-3"
              @update:value="typeof $event === 'string' && patchTranslationPreferences({ targetLanguage: $event })"
            />
          </label>
        </div>

        <!-- 开机自启动 -->
        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <div class="min-w-0">
            <div class="text-[13px] font-medium text-foreground">开机自启动</div>
            <div class="mt-1 text-[12px] text-muted-foreground">
              系统登录后自动启动应用，默认关闭。
            </div>
          </div>
          <n-switch
            :value="preferences.launchAtStartup"
            size="small"
            :loading="autoLaunchSaving || autoLaunchSyncing"
            :disabled="autoLaunchSaving || autoLaunchSyncing"
            @update:value="handleLaunchAtStartupChange"
          />
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

    <section>
      <div class="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">系统输入增强</div>
      <div class="divide-y divide-border/40 rounded-[16px] border border-border/60 bg-[var(--app-surface-elevated)]">
        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <div class="min-w-0">
            <div class="text-[13px] font-medium text-foreground">启用系统输入增强</div>
            <div class="mt-1 text-[12px] text-muted-foreground">
              仅在桌面端生效，当前先接入 Windows 优先的系统级模块骨架。
            </div>
            <div class="mt-1 text-[12px] text-muted-foreground">
              {{ SYSTEM_INPUT_ACTION_SHORTCUT_HINT }}
            </div>
          </div>
          <n-switch
            data-testid="system-input-enabled"
            :value="preferences.systemInput.enabled"
            size="small"
            @update:value="patchSystemInputConfig({ enabled: $event })"
          />
        </div>

        <div class="px-4 py-3">
          <n-alert :type="systemInputStatusType" :show-icon="false">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[13px]">{{ systemInputStatusText }}</span>
              <n-tag size="small" :bordered="false">{{ systemInputPermissionLabel }}</n-tag>
              <n-tag size="small" :bordered="false" type="info">{{ systemInputStatus.platform }}</n-tag>
            </div>
          </n-alert>
          <n-alert
            v-if="systemInputLastError && systemInputLastError !== systemInputStatus.lastError"
            class="mt-3"
            type="error"
            :show-icon="false"
          >
            {{ systemInputLastError }}
          </n-alert>
          <n-alert
            v-if="systemInputLastWritebackError"
            class="mt-3"
            type="warning"
            :show-icon="false"
          >
            {{ systemInputLastWritebackError }}
          </n-alert>
          <div
            v-if="systemInputTargetAppText"
            class="mt-3 text-[12px] text-muted-foreground"
          >
            最近命中应用：{{ systemInputTargetAppText }}
          </div>
        </div>

        <div class="grid gap-3 px-4 py-3">
          <div
            v-for="definition in systemInputActionShortcutDefinitions"
            :key="definition.field"
            class="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-[var(--app-surface)] px-3 py-3"
          >
            <div class="min-w-0">
              <div class="text-[13px] font-medium text-foreground">{{ definition.label }}</div>
              <div class="mt-1 text-[12px] text-muted-foreground">
                {{ definition.description }}
              </div>
            </div>
            <div class="flex items-center gap-1.5">
              <div
                :data-testid="`system-input-shortcut-${definition.field}`"
                class="min-w-[110px] cursor-pointer rounded-lg border px-3 py-1 text-center font-mono text-[12px] font-semibold select-none transition-all duration-150"
                :class="systemInputShortcutRecordingField === definition.field
                  ? 'border-primary bg-primary/10 text-primary animate-pulse'
                  : 'border-border/60 bg-[var(--app-surface-elevated)] text-foreground hover:border-primary/40'"
                @click="systemInputShortcutRecordingField !== definition.field && startSystemInputShortcutRecording(definition.field)"
              >
                {{ resolveSystemInputShortcutDisplayText(definition.field) }}
              </div>
              <n-button
                size="small"
                secondary
                :loading="systemInputShortcutRegistering && systemInputShortcutRecordingField === definition.field"
                @click="systemInputShortcutRecordingField === definition.field ? stopSystemInputShortcutRecording() : startSystemInputShortcutRecording(definition.field)"
              >
                {{ systemInputShortcutRecordingField === definition.field ? '取消' : '修改' }}
              </n-button>
              <n-button
                size="small"
                tertiary
                :disabled="systemInputShortcutRegistering"
                @click="handleResetSystemInputShortcut(definition.field)"
              >
                默认
              </n-button>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <div>
            <div class="text-[13px] font-medium text-foreground">触发方式</div>
            <div class="mt-1 text-[12px] text-muted-foreground">
              双空格更接近沉浸式翻译，双 Alt 更稳。
            </div>
          </div>
          <n-radio-group
            data-testid="system-input-trigger-mode"
            :value="preferences.systemInput.triggerMode"
            size="small"
            @update:value="patchSystemInputConfig({ triggerMode: $event })"
          >
            <n-radio-button
              v-for="option in systemInputTriggerModeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </n-radio-button>
          </n-radio-group>
        </div>

        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <div>
            <div class="text-[13px] font-medium text-foreground">双击间隔</div>
            <div class="mt-1 text-[12px] text-muted-foreground">
              调整双空格 / 双 Alt 的判定窗口，单位毫秒。
            </div>
          </div>
          <n-input-number
            data-testid="system-input-double-tap-interval"
            :value="preferences.systemInput.doubleTapIntervalMs"
            :min="120"
            :max="1000"
            :precision="0"
            size="small"
            class="w-32"
            @update:value="typeof $event === 'number' && patchSystemInputConfig({ doubleTapIntervalMs: $event })"
          />
        </div>

        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <div>
            <div class="text-[13px] font-medium text-foreground">目标语言</div>
            <div class="mt-1 text-[12px] text-muted-foreground">
              系统输入增强默认使用的翻译目标语言。支持自动目标模式，也支持按 Ctrl+~ 呼出悬浮窗并快速切换。
            </div>
          </div>
          <n-select
            data-testid="system-input-target-language"
            :value="preferences.systemInput.targetLanguage"
            :options="systemInputTargetLanguageOptions"
            size="small"
            class="w-48"
            @update:value="typeof $event === 'string' && patchSystemInputConfig({ targetLanguage: $event })"
          />
        </div>

        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <div>
            <div class="text-[13px] font-medium text-foreground">文本获取策略</div>
            <div class="mt-1 text-[12px] text-muted-foreground">
              决定优先尝试选中文本、光标前文本还是整段输入。
            </div>
          </div>
          <n-radio-group
            data-testid="system-input-capture-mode"
            :value="preferences.systemInput.captureMode"
            size="small"
            @update:value="patchSystemInputConfig({ captureMode: $event })"
          >
            <n-radio-button
              v-for="option in systemInputCaptureModeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </n-radio-button>
          </n-radio-group>
        </div>

        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <div>
            <div class="text-[13px] font-medium text-foreground">文本回填策略</div>
            <div class="mt-1 text-[12px] text-muted-foreground">
              自动模式会按原生替换、模拟输入、剪贴板依次回退。
            </div>
          </div>
          <n-radio-group
            data-testid="system-input-writeback-mode"
            :value="preferences.systemInput.writebackMode"
            size="small"
            @update:value="patchSystemInputConfig({ writebackMode: $event })"
          >
            <n-radio-button
              v-for="option in systemInputWritebackModeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </n-radio-button>
          </n-radio-group>
        </div>

        <div class="grid gap-3 px-4 py-3 lg:grid-cols-2">
          <label class="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-[var(--app-surface)] px-3 py-2.5">
            <span class="text-[13px] font-medium text-foreground">仅处理选中文本</span>
            <n-switch
              data-testid="system-input-only-selected-text"
              :value="preferences.systemInput.onlySelectedText"
              size="small"
              @update:value="patchSystemInputConfig({ onlySelectedText: $event })"
            />
          </label>
          <label class="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-[var(--app-surface)] px-3 py-2.5">
            <span class="text-[13px] font-medium text-foreground">自动替换原文</span>
            <n-switch
              data-testid="system-input-auto-replace"
              :value="preferences.systemInput.autoReplace"
              size="small"
              @update:value="patchSystemInputConfig({ autoReplace: $event })"
            />
          </label>
          <label class="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-[var(--app-surface)] px-3 py-2.5">
            <span class="text-[13px] font-medium text-foreground">
              {{ preferences.systemInput.translateSelectionShortcut }} 自动覆盖原文
            </span>
            <n-switch
              data-testid="system-input-replace-selection-on-shortcut-translate"
              :value="preferences.systemInput.replaceSelectionOnShortcutTranslate"
              size="small"
              @update:value="patchSystemInputConfig({ replaceSelectionOnShortcutTranslate: $event })"
            />
          </label>
          <label class="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-[var(--app-surface)] px-3 py-2.5">
            <span class="text-[13px] font-medium text-foreground">启用剪贴板回退</span>
            <n-switch
              data-testid="system-input-enable-clipboard-fallback"
              :value="preferences.systemInput.enableClipboardFallback"
              size="small"
              @update:value="patchSystemInputConfig({ enableClipboardFallback: $event })"
            />
          </label>
          <label class="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-[var(--app-surface)] px-3 py-2.5">
            <span class="text-[13px] font-medium text-foreground">显示轻提示</span>
            <n-switch
              data-testid="system-input-show-floating-hint"
              :value="preferences.systemInput.showFloatingHint"
              size="small"
              @update:value="patchSystemInputConfig({ showFloatingHint: $event })"
            />
          </label>
          <label class="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-[var(--app-surface)] px-3 py-2.5">
            <span class="text-[13px] font-medium text-foreground">仅英文触发</span>
            <n-switch
              data-testid="system-input-only-when-english-text"
              :value="preferences.systemInput.onlyWhenEnglishText"
              size="small"
              @update:value="patchSystemInputConfig({ onlyWhenEnglishText: $event })"
            />
          </label>
          <label class="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-[var(--app-surface)] px-3 py-2.5">
            <span class="text-[13px] font-medium text-foreground">排除代码编辑器</span>
            <n-switch
              data-testid="system-input-exclude-code-editors"
              :value="preferences.systemInput.excludeCodeEditors"
              size="small"
              @update:value="patchSystemInputConfig({ excludeCodeEditors: $event })"
            />
          </label>
          <label class="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-[var(--app-surface)] px-3 py-2.5 lg:col-span-2">
            <span class="text-[13px] font-medium text-foreground">调试日志</span>
            <n-switch
              data-testid="system-input-debug-logging"
              :value="preferences.systemInput.debugLogging"
              size="small"
              @update:value="patchSystemInputConfig({ debugLogging: $event })"
            />
          </label>
        </div>

        <div class="grid gap-3 px-4 py-3 lg:grid-cols-2">
          <div class="rounded-xl border border-border/50 bg-[var(--app-surface)] p-3">
            <div class="mb-2 text-[13px] font-medium text-foreground">应用黑名单</div>
            <div class="mb-2 text-[12px] text-muted-foreground">
              每行一个应用名、进程名或 bundle id，命中后不触发。
            </div>
            <n-input
              data-testid="system-input-blacklist"
              v-model:value="systemInputBlacklistText"
              type="textarea"
              :autosize="{ minRows: 4, maxRows: 8 }"
              placeholder="Code.exe&#10;cursor.exe"
              @blur="handleSystemInputBlacklistBlur"
            />
          </div>

          <div class="rounded-xl border border-border/50 bg-[var(--app-surface)] p-3">
            <div class="mb-2 text-[13px] font-medium text-foreground">应用白名单</div>
            <div class="mb-2 text-[12px] text-muted-foreground">
              非空时只对名单内应用生效，每行一个标识。
            </div>
            <n-input
              data-testid="system-input-whitelist"
              v-model:value="systemInputWhitelistText"
              type="textarea"
              :autosize="{ minRows: 4, maxRows: 8 }"
              placeholder="notepad.exe&#10;WINWORD.EXE"
              @blur="handleSystemInputWhitelistBlur"
            />
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
