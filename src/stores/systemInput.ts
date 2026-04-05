import { computed, ref, watch } from "vue";
import { acceptHMRUpdate, defineStore } from "pinia";
import { createLogger } from "@/services/logging/logger";
import { summarizeTranslationText } from "@/services/logging/logSanitizer";
import { useAppConfigStore } from "@/stores/appConfig";
import { useTranslationStore } from "@/stores/translation";
import { formatTranslationResolutionSummary } from "@/services/ai/translationResolutionFormatter";
import { toErrorStack } from "@/utils/error";
import {
  beginSystemInputTargetLanguageOverlaySession,
  clearSystemInputTargetLanguageOverlaySession,
  hasSystemInputTargetLanguageOverlaySession,
  isSystemInputTargetLanguageOverlayActive,
  showSystemInputTargetLanguageOverlay,
} from "@/services/window/windowManager";
import {
  captureSystemSelectedText,
  getSystemInputNativeStatus,
  initializeSystemInputNative,
  pasteSystemInputText,
  readSystemClipboardText,
  updateSystemInputNativeConfig,
} from "@/services/systemInput/nativeBridge";
import { showSystemInputNotification } from "@/services/systemInput/systemNotification";
import {
  buildShortcutRequest,
  buildShortcutRequestKey,
  executeShortcutTranslation,
  resolvePreferredModels,
} from "@/services/systemInput/shortcutTranslator";
import {
  createSystemInputTargetLanguageOverlayPayload,
  formatSystemInputTargetLanguageShortcutLabel,
  resolveNextSystemInputTargetLanguage,
  resolveSystemInputTargetLanguageValue,
} from "@/services/systemInput/targetLanguageSwitcher";
import {
  createDefaultSystemInputStatus,
  type SystemInputStatus,
} from "@/types/systemInput";

const logger = createLogger({
  source: "store",
  category: "external-input",
});

export const useSystemInputStore = defineStore("system-input", () => {
  const appConfigStore = useAppConfigStore();
  const translationStore = useTranslationStore();

  const initialized = ref(false);
  const syncing = ref(false);
  const status = ref<SystemInputStatus>(createDefaultSystemInputStatus());
  const lastError = ref("");
  const lastWritebackError = ref("");
  const lastShortcutTranslation = ref("");
  const lastShortcutRequestKey = ref("");
  const shortcutActionRunning = ref(false);

  let stopConfigSync: (() => void) | null = null;

  const isEnabled = computed(() => appConfigStore.preferences.systemInput.enabled);

  function resolveRequestedTargetLanguage() {
    const configuredTargetLanguage = appConfigStore.preferences.translation.targetLanguage;

    if (configuredTargetLanguage.trim().length > 0) {
      return configuredTargetLanguage;
    }

    return appConfigStore.preferences.locale === "en-US" ? "English" : "Chinese (Simplified)";
  }

  async function presentSystemNotification(title: string, body?: string) {
    try {
      await showSystemInputNotification(title, body);
    } catch {
      // Ignore notification failures so they do not block the shortcut flow.
    }
  }

  async function ensureReadyForShortcuts() {
    if (!initialized.value) {
      await initialize();
    }
  }

  function shortcutLabel(
    key:
      | "translateSelectionShortcut"
      | "translateClipboardShortcut"
      | "pasteLastTranslationShortcut"
      | "toggleEnabledShortcut",
  ) {
    return appConfigStore.preferences.systemInput[key];
  }

  async function ensureFeatureEnabledForShortcuts() {
    await ensureReadyForShortcuts();

    if (appConfigStore.preferences.systemInput.enabled) {
      return true;
    }

    await presentSystemNotification(
      "快捷输入已关闭",
      `按 ${shortcutLabel("toggleEnabledShortcut")} 可以重新开启。`,
    );
    return false;
  }

  async function reuseLastShortcutTranslation(
    origin: "selection" | "clipboard",
  ) {
    if (!lastShortcutTranslation.value.trim()) {
      return false;
    }

    await presentSystemNotification(
      "已跳过重复翻译",
      `源内容未变化，继续使用上次译文。按 ${shortcutLabel("pasteLastTranslationShortcut")} 粘贴。`,
    );
    await logger.info("external-input.shortcut.reuse", "复用上次快捷键译文", {
      detail: {
        origin,
      },
    });
    return true;
  }

  async function translateFromShortcut(
    sourceText: string,
    origin: "selection" | "clipboard",
  ) {
    const normalizedSourceText = sourceText.trim();

    if (!normalizedSourceText) {
      await presentSystemNotification(
        origin === "selection" ? "未检测到选中文本" : "剪贴板没有文本内容",
        origin === "selection"
          ? `先选中文本，再按 ${shortcutLabel("translateSelectionShortcut")}。`
          : `复制文本后，再按 ${shortcutLabel("translateClipboardShortcut")}。`,
      );
      return false;
    }

    if (shortcutActionRunning.value) {
      await presentSystemNotification("快捷输入忙碌中", "上一条快捷键翻译还没有完成。");
      return false;
    }

    const { primaryModel, fallbackModel } = resolvePreferredModels(
      appConfigStore.selectedTranslationModel,
      appConfigStore.defaultModel,
    );

    if (!primaryModel) {
      lastError.value = "请先在模型设置中添加并启用至少一个模型。";
      await presentSystemNotification("翻译失败", lastError.value);
      return false;
    }

    const request = buildShortcutRequest(normalizedSourceText, {
      sourceLanguage: appConfigStore.preferences.systemInput.sourceLanguage,
      targetLanguage: resolveRequestedTargetLanguage(),
    });
    const requestKey = buildShortcutRequestKey(request, primaryModel, origin);
    await logger.info("external-input.shortcut.translate.start", "快捷键翻译开始", {
      detail: {
        origin,
        modelId: primaryModel.id,
        sourceText: summarizeTranslationText(normalizedSourceText),
      },
    });

    if (lastShortcutRequestKey.value === requestKey) {
      return await reuseLastShortcutTranslation(origin);
    }

    shortcutActionRunning.value = true;
    lastError.value = "";

    try {
      const outcome = await executeShortcutTranslation(
        { request, origin, primaryModel, fallbackModel },
        { translationStore },
      );

      lastShortcutTranslation.value = outcome.translatedText;
      lastShortcutRequestKey.value = requestKey;
      lastWritebackError.value = "";
      const resolutionSummary = formatTranslationResolutionSummary(outcome.resolvedRequest.resolution);
      await logger.info("external-input.shortcut.translate.success", "快捷键翻译完成", {
        detail: {
          origin,
          modelId: outcome.activeModel.id,
          modelName: outcome.activeModel.name,
          resolutionSummary,
          resultText: summarizeTranslationText(outcome.translatedText),
        },
      });

      await presentSystemNotification(
        origin === "selection" ? "选中文本翻译完成" : "剪贴板翻译完成",
        resolutionSummary
          ? `${resolutionSummary} 已生成译文，按 ${shortcutLabel("pasteLastTranslationShortcut")} 粘贴。`
          : `已生成译文，按 ${shortcutLabel("pasteLastTranslationShortcut")} 粘贴。`,
      );

      return true;
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : "快捷键翻译失败。";
      await logger.error("external-input.shortcut.translate.failed", "快捷键翻译失败", {
        detail: {
          origin,
          sourceText: summarizeTranslationText(normalizedSourceText),
        },
        errorStack: toErrorStack(error),
      });
      await presentSystemNotification("翻译失败", lastError.value);
      return false;
    } finally {
      shortcutActionRunning.value = false;
    }
  }

  async function syncConfigToNative() {
    if (syncing.value) {
      return;
    }

    syncing.value = true;

    try {
      status.value = await updateSystemInputNativeConfig(appConfigStore.preferences.systemInput);
      if (status.value.lastError) {
        lastError.value = status.value.lastError;
      }
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : "同步快捷输入配置失败。";
      await logger.error("external-input.config.sync-failed", "同步快捷输入配置失败", {
        detail: {
          config: appConfigStore.preferences.systemInput,
        },
        errorStack: toErrorStack(error),
      });
    } finally {
      syncing.value = false;
    }
  }

  async function refreshStatusFromNative() {
    try {
      status.value = await getSystemInputNativeStatus();

      if (status.value.lastError) {
        lastError.value = status.value.lastError;
      }
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : "读取快捷输入状态失败。";
      await logger.warn("external-input.status.refresh-failed", "读取快捷输入状态失败", {
        errorStack: toErrorStack(error),
      });
    }
  }

  async function initialize() {
    if (initialized.value) {
      return;
    }

    if (!appConfigStore.initialized) {
      await appConfigStore.initialize();
    }

    try {
      status.value = await initializeSystemInputNative(appConfigStore.preferences.systemInput);
      stopConfigSync = watch(
        () => appConfigStore.preferences.systemInput,
        () => {
          void syncConfigToNative();
        },
        { deep: true },
      );
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : "初始化快捷输入失败。";

      try {
        status.value = await getSystemInputNativeStatus();
      } catch {
        status.value = {
          ...createDefaultSystemInputStatus(),
          lastError: lastError.value,
        };
      }
    }

    initialized.value = true;
  }

  async function translateSelectedTextFromShortcut() {
    if (!(await ensureFeatureEnabledForShortcuts())) {
      return false;
    }

    try {
      const selectedText = await captureSystemSelectedText();
      return await translateFromShortcut(selectedText ?? "", "selection");
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : "读取选中文本失败。";
      await logger.error("external-input.shortcut.capture-selection-failed", "读取选中文本失败", {
        errorStack: toErrorStack(error),
      });
      await presentSystemNotification("读取选中文本失败", lastError.value);
      return false;
    }
  }

  async function translateClipboardTextFromShortcut() {
    if (!(await ensureFeatureEnabledForShortcuts())) {
      return false;
    }

    try {
      const clipboardText = await readSystemClipboardText();
      return await translateFromShortcut(clipboardText ?? "", "clipboard");
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : "读取剪贴板失败。";
      await logger.error("external-input.shortcut.clipboard-read-failed", "读取剪贴板失败", {
        errorStack: toErrorStack(error),
      });
      await presentSystemNotification("读取剪贴板失败", lastError.value);
      return false;
    }
  }

  async function pasteLastTranslationFromShortcut() {
    if (!(await ensureFeatureEnabledForShortcuts())) {
      return false;
    }

    if (!lastShortcutTranslation.value.trim()) {
      await presentSystemNotification(
        "没有可粘贴的译文",
        `先按 ${shortcutLabel("translateSelectionShortcut")} 或 ${shortcutLabel("translateClipboardShortcut")} 生成译文，再按 ${shortcutLabel("pasteLastTranslationShortcut")}。`,
      );
      return false;
    }

    try {
      const success = await pasteSystemInputText(lastShortcutTranslation.value);

      if (!success) {
        lastWritebackError.value = "未找到可粘贴的外部输入焦点。";
        await presentSystemNotification("粘贴失败", lastWritebackError.value);
        return false;
      }

      lastWritebackError.value = "";
      await presentSystemNotification("已粘贴译文");
      return true;
    } catch (error) {
      lastWritebackError.value = error instanceof Error ? error.message : "粘贴译文失败。";
      await presentSystemNotification("粘贴失败", lastWritebackError.value);
      return false;
    }
  }

  async function toggleEnabledFromShortcut() {
    await ensureReadyForShortcuts();

    const nextEnabled = !appConfigStore.preferences.systemInput.enabled;

    try {
      await appConfigStore.updateSystemInputConfig({
        enabled: nextEnabled,
      });
      await syncConfigToNative();

      await presentSystemNotification(
        nextEnabled ? "快捷输入已开启" : "快捷输入已关闭",
        nextEnabled
          ? `${shortcutLabel("translateSelectionShortcut")} 选中翻译，${shortcutLabel("translateClipboardShortcut")} 剪贴板翻译，${shortcutLabel("pasteLastTranslationShortcut")} 粘贴译文。`
          : `按 ${shortcutLabel("toggleEnabledShortcut")} 可以重新开启。`,
      );
      await logger.info("external-input.toggle", "快捷输入状态已切换", {
        detail: {
          enabled: nextEnabled,
        },
      });

      return nextEnabled;
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : "切换快捷输入失败。";
      await logger.error("external-input.toggle.failed", "切换快捷输入失败", {
        errorStack: toErrorStack(error),
      });
      await presentSystemNotification("切换失败", lastError.value);
      return appConfigStore.preferences.systemInput.enabled;
    }
  }

  async function previewOrCycleTargetLanguageFromShortcut() {
    const hasPendingOverlaySession = hasSystemInputTargetLanguageOverlaySession();

    if (!hasPendingOverlaySession) {
      beginSystemInputTargetLanguageOverlaySession();
    }

    const overlayActive =
      hasPendingOverlaySession || (await isSystemInputTargetLanguageOverlayActive());

    try {
      await ensureReadyForShortcuts();

      const currentTargetLanguage = resolveSystemInputTargetLanguageValue(
        appConfigStore.preferences.translation.targetLanguage,
      );
      const nextTargetLanguage = overlayActive
        ? resolveNextSystemInputTargetLanguage(currentTargetLanguage)
        : currentTargetLanguage;

      if (nextTargetLanguage !== appConfigStore.preferences.translation.targetLanguage) {
        await appConfigStore.updateTranslationPreferences({
          targetLanguage: nextTargetLanguage,
        });
      }

      await showSystemInputTargetLanguageOverlay(
        createSystemInputTargetLanguageOverlayPayload(
          nextTargetLanguage,
          appConfigStore.preferences.systemInput.targetLanguageSwitchShortcut,
        ),
      );
      await logger.info("external-input.target-language.switch", "快捷输入目标语言快捷切换完成", {
        detail: {
          nextTargetLanguage,
          overlayActive,
        },
      });

      return nextTargetLanguage;
    } catch (error) {
      clearSystemInputTargetLanguageOverlaySession();
      lastError.value = error instanceof Error ? error.message : "切换目标语言失败。";
      await logger.error("external-input.target-language.switch-failed", "快捷输入目标语言切换失败", {
        errorStack: toErrorStack(error),
      });
      await presentSystemNotification(
        "切换目标语言失败",
        `${lastError.value} 当前快捷键：${formatSystemInputTargetLanguageShortcutLabel(
          appConfigStore.preferences.systemInput.targetLanguageSwitchShortcut,
        )}`,
      );
      return resolveSystemInputTargetLanguageValue(
        appConfigStore.preferences.translation.targetLanguage,
      );
    }
  }

  function dispose() {
    stopConfigSync?.();
    stopConfigSync = null;
    lastShortcutRequestKey.value = "";
    initialized.value = false;
  }

  return {
    initialized,
    syncing,
    status,
    lastError,
    lastWritebackError,
    lastShortcutTranslation,
    shortcutActionRunning,
    isEnabled,
    initialize,
    syncConfigToNative,
    refreshStatusFromNative,
    translateSelectedTextFromShortcut,
    translateClipboardTextFromShortcut,
    pasteLastTranslationFromShortcut,
    toggleEnabledFromShortcut,
    previewOrCycleTargetLanguageFromShortcut,
    dispose,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSystemInputStore, import.meta.hot));
}
