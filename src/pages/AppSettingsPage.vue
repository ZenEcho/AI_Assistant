<script setup lang="ts">
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import {
  NAlert,
  NButton,
  NInputNumber,
  NProgress,
  NRadioGroup,
  NRadioButton,
  NSelect,
  NSwitch,
  NTag,
  type SelectOption,
  useDialog,
  useMessage,
} from "naive-ui";
import {
  closeBehaviorOptions,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_TRANSLATE_SHORTCUT,
  MAX_HISTORY_LIMIT,
  SYSTEM_INPUT_ACTION_SHORTCUTS,
  SYSTEM_INPUT_ACTION_SHORTCUT_HINT,
  SYSTEM_INPUT_TARGET_LANGUAGE_SWITCH_SHORTCUT,
  themeModeOptions,
} from "@/constants/app";
import { targetLanguageOptions as translationTargetLanguageOptionList } from "@/constants/languages";
import { useAppConfigStore } from "@/stores/appConfig";
import { useOcrStore } from "@/stores/ocr";
import { useSystemInputStore } from "@/stores/systemInput";
import { useTranslationStore } from "@/stores/translation";
import {
  formatSystemInputPermissionState,
} from "@/services/systemInput/modeFormatter";
import {
  registerGlobalShortcut,
  registerNamedShortcut,
} from "@/services/shortcut/globalShortcutService";
import {
  buildShortcutString,
  formatRecordedShortcut,
  isShortcutRecordComplete,
} from "@/services/shortcut/shortcutUtils";
import {
  buildShortcutConflictAssistMessage,
  registerShortcutWithCtrlFallback,
} from "@/services/shortcut/shortcutConflictResolver";
import {
  checkForGithubReleaseUpdate,
  GITHUB_RELEASES_URL,
  getCurrentAppVersion,
  type ReleaseCheckResult,
} from "@/services/app/updateService";
import { resetSoftwareData } from "@/services/app/resetService";
import { createLogger } from "@/services/logging/logger";
import type { CloseBehavior, ThemeMode } from "@/types/app";
import type { SystemInputConfig } from "@/types/systemInput";
import type { OcrEngineId } from "@/types/ocr";

const appConfigStore = useAppConfigStore();
const ocrStore = useOcrStore();
const systemInputStore = useSystemInputStore();
const translationStore = useTranslationStore();
const { preferences } = storeToRefs(appConfigStore);
const { statuses: ocrStatuses } = storeToRefs(ocrStore);
const {
  status: systemInputStatus,
  lastError: systemInputLastError,
  lastWritebackError: systemInputLastWritebackError,
} = storeToRefs(systemInputStore);
const { history } = storeToRefs(translationStore);
const dialog = useDialog();
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
const resetSoftwarePending = ref(false);

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

async function executeResetSoftware() {
  if (resetSoftwarePending.value) {
    return;
  }

  resetSoftwarePending.value = true;

  try {
    await resetSoftwareData({
      resetAppData: () => appConfigStore.resetAppData(),
      clearHistory: () => translationStore.clearHistory(),
    });
  } catch (error) {
    await logger.error("settings.reset-software.failed", "重置软件失败", {
      category: "storage",
      errorStack: error instanceof Error ? error.stack : String(error),
    });
    message.error(`重置软件失败：${formatErrorMessage(error)}`);
  } finally {
    resetSoftwarePending.value = false;
  }
}

function handleResetSoftware() {
  if (resetSoftwarePending.value) {
    return;
  }

  dialog.warning({
    title: "重置软件",
    content: "重置软件将删除所有配置、模型、历史、缓存和日志，且不可恢复。是否继续？",
    positiveText: "确认重置",
    negativeText: "取消",
    onPositiveClick: async () => {
      await executeResetSoftware();
    },
  });
}

const translationTargetLanguageOptions = computed<SelectOption[]>(() =>
  translationTargetLanguageOptionList.map((option) => ({
    label: option.label,
    value: option.value,
  })),
);
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
    return `快捷输入原生能力已就绪，运行平台：${systemInputStatus.value.platform}。`;
  }

  return systemInputStatus.value.lastError || "快捷输入原生能力尚未就绪。";
});

const systemInputActionShortcutDefinitions = [
  {
    field: "targetLanguageSwitchShortcut",
    id: "system-input-target-language-overlay",
    label: "切换目标语言",
    description: "首次按下先显示当前目标语言，再次按下切换到下一个目标语言。",
    defaultValue: SYSTEM_INPUT_TARGET_LANGUAGE_SWITCH_SHORTCUT,
    run: async () => {
      await systemInputStore.previewOrCycleTargetLanguageFromShortcut();
    },
  },
  {
    field: "translateSelectionShortcut",
    id: "system-input-translate-selection",
    label: "翻译选中文本",
    description: "翻译外部应用中的选中文本，并将结果保存为最近一次翻译。",
    defaultValue: SYSTEM_INPUT_ACTION_SHORTCUTS.translateSelection,
    run: async () => {
      await systemInputStore.translateSelectedTextFromShortcut();
    },
  },
  {
    field: "translateClipboardShortcut",
    id: "system-input-translate-clipboard",
    label: "翻译剪贴板",
    description: "读取剪贴板文本并生成翻译，方便快速粘贴。",
    defaultValue: SYSTEM_INPUT_ACTION_SHORTCUTS.translateClipboard,
    run: async () => {
      await systemInputStore.translateClipboardTextFromShortcut();
    },
  },
  {
    field: "pasteLastTranslationShortcut",
    id: "system-input-paste-last-translation",
    label: "粘贴最近翻译",
    description: "将最近一次快捷翻译结果粘贴到当前输入位置。",
    defaultValue: SYSTEM_INPUT_ACTION_SHORTCUTS.pasteLastTranslation,
    run: async () => {
      await systemInputStore.pasteLastTranslationFromShortcut();
    },
  },
  {
    field: "toggleEnabledShortcut",
    id: "system-input-toggle-enabled",
    label: "切换快捷输入",
    description: "快速启用或禁用快捷输入，并显示系统通知。",
    defaultValue: SYSTEM_INPUT_ACTION_SHORTCUTS.toggleEnabled,
    run: async () => {
      await systemInputStore.toggleEnabledFromShortcut();
    },
  },
] as const;

type SystemInputActionShortcutField = typeof systemInputActionShortcutDefinitions[number]["field"];

async function patchSystemInputConfig(partial: Partial<SystemInputConfig>) {
  await appConfigStore.updateSystemInputConfig(partial);
  await systemInputStore.syncConfigToNative();
}

async function patchTranslationPreferences(
  partial: Partial<typeof preferences.value.translation>,
) {
  await appConfigStore.updateTranslationPreferences(partial);
}

const ocrEngineLabelMap: Record<OcrEngineId, string> = {
  rapidocr: "RapidOCR",
  paddleocr: "PaddleOCR",
};

const ocrStatusTextMap = {
  "not-installed": "未安装",
  downloading: "下载中",
  installed: "已安装",
  failed: "安装失败",
} as const;

const ocrEngineOptions = computed<SelectOption[]>(() =>
  (Object.entries(ocrEngineLabelMap) as Array<[OcrEngineId, string]>).map(([value, label]) => ({
    label,
    value,
  })),
);

const ocrStatusEntries = computed(() =>
  (Object.keys(ocrEngineLabelMap) as OcrEngineId[]).map((engineId) => {
    const runtimeStatus = ocrStatuses.value.find((item) => item.engineId === engineId);

    return {
      engineId,
      label: ocrEngineLabelMap[engineId],
      status: runtimeStatus?.status ?? "not-installed",
      version: runtimeStatus?.version ?? null,
      downloadProgress: runtimeStatus?.downloadProgress ?? null,
      errorMessage: runtimeStatus?.errorMessage ?? null,
      selected: preferences.value.translation.ocrEngine === engineId,
    };
  }),
);

async function handleOcrEngineChange(value: string | number | null) {
  if (value !== "rapidocr" && value !== "paddleocr") {
    return;
  }

  await patchTranslationPreferences({
    ocrEngine: value,
  });
}

async function handleDownloadOcrEngine(engineId: OcrEngineId) {
  await ocrStore.downloadEngine(engineId);
}

const systemInputShortcutRecordingField = ref<SystemInputActionShortcutField | null>(null);
const recordedSystemInputShortcutKeys = ref<string[]>([]);
const systemInputShortcutRegistering = ref(false);

function resolveSystemInputShortcutDefinition(field: SystemInputActionShortcutField) {
  const definition = systemInputActionShortcutDefinitions.find((item) => item.field === field);

  if (!definition) {
    throw new Error(`未知的快捷输入快捷键字段：${field}`);
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

function openShortcutConflictDialog(options: {
  label: string;
  originalShortcut: string;
  fallbackShortcut?: string | null;
  restartRecording: () => void;
}) {
  dialog.warning({
    title: `${options.label} 快捷键已被占用`,
    content: buildShortcutConflictAssistMessage(
      options.originalShortcut,
      options.fallbackShortcut,
    ),
    positiveText: "重新设置",
    negativeText: "关闭",
    onPositiveClick: () => {
      options.restartRecording();
    },
  });
}

async function applySystemInputShortcut(
  field: SystemInputActionShortcutField,
  shortcut: string,
) {
  systemInputShortcutRegistering.value = true;

  try {
    const definition = resolveSystemInputShortcutDefinition(field);
    const attempt = await registerShortcutWithCtrlFallback(shortcut, (value) =>
      registerSystemInputActionShortcut(field, value),
    );
    const appliedShortcut = attempt.finalShortcut;

    if (!attempt.result.success) {
      stopSystemInputShortcutRecording();

      if (attempt.result.conflict) {
        openShortcutConflictDialog({
          label: definition.label,
          originalShortcut: shortcut,
          fallbackShortcut: attempt.fallbackShortcut,
          restartRecording: () => {
            startSystemInputShortcutRecording(field);
          },
        });
        return;
      }

      message.error(
        attempt.result.error ?? `注册快捷键 ${appliedShortcut} 失败。`,
      );
      return;
    }

    await patchSystemInputConfig({
      [field]: appliedShortcut,
    } as Partial<SystemInputConfig>);

    stopSystemInputShortcutRecording();

    if (attempt.usedFallback) {
      message.warning(
        `${definition.label} 原快捷键 ${shortcut} 已被占用，已自动改为 ${appliedShortcut}`,
      );
      return;
    }

    message.success(`${definition.label} 已设置为 ${appliedShortcut}`);
  } finally {
    systemInputShortcutRegistering.value = false;
  }
}

async function handleResetSystemInputShortcut(field: SystemInputActionShortcutField) {
  await applySystemInputShortcut(field, resolveSystemInputShortcutDefinition(field).defaultValue);
}

// 全局快捷键

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
    void applyShortcut(formatRecordedShortcut(combo));
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

async function applyShortcut(shortcut: string) {
  shortcutRegistering.value = true;
  shortcutConflict.value = false;
  shortcutError.value = "";

  try {
    const registration = await registerShortcutWithCtrlFallback(shortcut, (value) =>
      registerGlobalShortcut(value),
    );
    const appliedShortcut = registration.finalShortcut;

    if (registration.result.success) {
      await appConfigStore.setGlobalShortcut(appliedShortcut);
      shortcutRecording.value = false;
      recordedKeys.value = [];
      shortcutConflict.value = false;

      if (registration.usedFallback) {
        message.warning(
          `原快捷键 ${shortcut} 已被占用，已自动改为 ${appliedShortcut}`,
        );
        return;
      }

      message.success(`快捷键已设置为 ${appliedShortcut}`);
      return;
    }

    shortcutRecording.value = false;
    recordedKeys.value = [];

    if (registration.result.conflict) {
      openShortcutConflictDialog({
        label: "全局",
        originalShortcut: shortcut,
        fallbackShortcut: registration.fallbackShortcut,
        restartRecording: () => {
          startRecording();
        },
      });
      return;
    }

    shortcutError.value = registration.result.error ?? "注册快捷键失败。";
  } finally {
    shortcutRegistering.value = false;
  }
}

async function handleForceApply() {
  const shortcut = recordedKeys.value.join("+") || preferences.value.globalShortcut;
  await applyShortcut(shortcut);
}

async function handleResetShortcut() {
  await applyShortcut(DEFAULT_GLOBAL_SHORTCUT);
  shortcutConflict.value = false;
  shortcutError.value = "";
}

async function applyTranslateShortcut(shortcut: string) {
  await appConfigStore.setTranslateShortcut(shortcut);
  translateShortcutRecording.value = false;
  recordedTranslateKeys.value = [];
  message.success(`触发翻译快捷键已设置为 ${shortcut}`);
}

async function handleResetTranslateShortcut() {
  await applyTranslateShortcut(DEFAULT_TRANSLATE_SHORTCUT);
}

onBeforeUnmount(() => {
  removeRecordingListener();
  removeTranslateRecordingListener();
  removeSystemInputShortcutRecordingListener();
});

// 版本更新

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
  void ocrStore.initialize();
  void systemInputStore.refreshStatusFromNative();
  void syncLaunchAtStartupPreference({ silent: true });
  void loadCurrentAppVersion();
  void handleCheckGithubRelease({ silentSuccess: true });
});
</script>

<template>
  <div class="flex flex-col gap-5 pb-4">
    <section>
      <div class="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">外观</div>
      <div class="divide-y divide-border/40 rounded-[16px] border border-border/60 bg-[var(--app-surface-elevated)]">
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

    <section>
      <div class="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">行为</div>
      <div class="divide-y divide-border/40 rounded-[16px] border border-border/60 bg-[var(--app-surface-elevated)]">
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

        <div class="flex flex-col gap-2 px-4 py-3">
          <div class="flex items-center justify-between gap-3">
            <span class="text-[13px] font-medium text-foreground">显示 / 隐藏窗口</span>
            <div class="flex items-center gap-1.5">
              <div
                data-testid="global-shortcut-display"
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
      <div class="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">快捷输入</div>
      <div class="divide-y divide-border/40 rounded-[16px] border border-border/60 bg-[var(--app-surface-elevated)]">
        <div class="px-4 py-3">
          <div class="text-[13px] font-medium text-foreground">快捷输入快捷键</div>
          <div class="mt-1 text-[12px] text-muted-foreground">
            {{ SYSTEM_INPUT_ACTION_SHORTCUT_HINT }}
          </div>
        </div>

        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <div class="min-w-0">
            <div class="text-[13px] font-medium text-foreground">启用快捷输入</div>
            <div class="mt-1 text-[12px] text-muted-foreground">
              与快捷键 {{ preferences.systemInput.toggleEnabledShortcut }} 的开关效果一致。
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
            <div class="text-[13px] font-medium text-foreground">目标语言</div>
            <div class="mt-1 text-[12px] text-muted-foreground">
              快捷输入与主翻译页共用同一套目标语言设置。
            </div>
          </div>
          <n-select
            data-testid="system-input-target-language"
            :value="preferences.translation.targetLanguage"
            :options="translationTargetLanguageOptions"
            size="small"
            class="w-48"
            @update:value="typeof $event === 'string' && patchTranslationPreferences({ targetLanguage: $event })"
          />
        </div>
      </div>
    </section>

    <section>
      <div class="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">OCR 引擎</div>
      <div class="divide-y divide-border/40 rounded-[16px] border border-border/60 bg-[var(--app-surface-elevated)]">
        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <div class="min-w-0">
            <div class="text-[13px] font-medium text-foreground">默认识别引擎</div>
            <div class="mt-1 text-[12px] text-muted-foreground">
              图片翻译默认使用本地 OCR 引擎，未安装时可按需下载。
            </div>
          </div>
          <n-select
            data-testid="ocr-engine-select"
            :value="preferences.translation.ocrEngine"
            :options="ocrEngineOptions"
            size="small"
            class="w-48"
            @update:value="handleOcrEngineChange"
          />
        </div>

        <div class="grid gap-3 px-4 py-3">
          <div
            v-for="entry in ocrStatusEntries"
            :key="entry.engineId"
            class="rounded-xl border border-border/50 bg-[var(--app-surface)] px-3 py-3"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-[13px] font-medium text-foreground">{{ entry.label }}</span>
                  <n-tag
                    size="small"
                    :bordered="false"
                    :type="entry.status === 'installed' ? 'success' : entry.status === 'failed' ? 'error' : 'default'"
                  >
                    {{ ocrStatusTextMap[entry.status] }}
                  </n-tag>
                  <n-tag v-if="entry.selected" size="small" :bordered="false" type="info">
                    当前默认
                  </n-tag>
                </div>
                <div class="mt-1 text-[12px] text-muted-foreground">
                  {{ entry.version ? `版本 ${entry.version}` : "尚未安装本地运行时" }}
                </div>
              </div>

              <button
                v-if="entry.status !== 'installed'"
                :data-testid="`download-${entry.engineId}`"
                type="button"
                :disabled="entry.status === 'downloading'"
                class="rounded-lg border border-border/60 px-3 py-1 text-[12px] font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                @click="void handleDownloadOcrEngine(entry.engineId)"
              >
                {{ entry.status === "downloading" ? "下载中" : "下载" }}
              </button>
            </div>

            <n-progress
              v-if="entry.status === 'downloading' && entry.downloadProgress !== null"
              class="mt-3"
              type="line"
              :percentage="entry.downloadProgress"
              :show-indicator="true"
            />

            <n-alert
              v-if="entry.errorMessage"
              class="mt-3"
              type="error"
              :show-icon="false"
            >
              {{ entry.errorMessage }}
            </n-alert>
          </div>
        </div>
      </div>
    </section>

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

    <section>
      <div class="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">危险操作</div>
      <div class="rounded-[16px] border border-red-500/30 bg-red-500/5">
        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <div class="min-w-0">
            <div class="text-[13px] font-medium text-foreground">重置软件</div>
            <div class="mt-1 text-[12px] text-muted-foreground">
              删除所有配置、模型、历史、缓存和日志。开发环境会退出软件，生产环境会自动重启。
            </div>
          </div>
          <n-button
            data-testid="reset-software"
            size="small"
            type="error"
            :loading="resetSoftwarePending"
            :disabled="resetSoftwarePending"
            @click="handleResetSoftware"
          >
            重置软件
          </n-button>
        </div>
      </div>
    </section>

    <div class="flex justify-end">
      <n-button size="small" secondary @click="handleResetAppearance">恢复默认偏好</n-button>
    </div>
  </div>
</template>
