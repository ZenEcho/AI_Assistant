import { computed, ref, watch } from "vue";
import { acceptHMRUpdate, defineStore } from "pinia";
import { createLogger } from "@/services/logging/logger";
import { summarizeTranslationText } from "@/services/logging/logSanitizer";
import { useAppConfigStore } from "@/stores/appConfig";
import { useTranslationStore } from "@/stores/translation";
import { formatTranslationResolutionSummary } from "@/services/ai/translationResolutionFormatter";
import {
  beginSystemInputTargetLanguageOverlaySession,
  clearSystemInputTargetLanguageOverlaySession,
  hasSystemInputTargetLanguageOverlaySession,
  isSystemInputTargetLanguageOverlayActive,
  presentTranslationResultInResultWindow,
  showSystemInputTargetLanguageOverlay,
} from "@/services/window/windowManager";
import {
  cancelSystemInputSession,
  captureSystemSelectedText,
  captureSystemSelectedTextWithContext,
  getSystemInputNativeStatus,
  initializeSystemInputNative,
  listenSystemInputStatus,
  listenSystemInputTranslationRequest,
  pasteSystemInputText,
  readSystemClipboardText,
  listenSystemInputWritebackResult,
  submitSystemInputTranslation,
  updateSystemInputNativeConfig,
} from "@/services/systemInput/nativeBridge";
import { showSystemInputNotification } from "@/services/systemInput/systemNotification";
import { resolveSystemInputExcludedWindowLabels } from "@/services/systemInput/selfExclusion";
import { runSystemInputTranslationSession } from "@/services/systemInput/sessionOrchestrator";
import {
  createSystemInputTargetLanguageOverlayPayload,
  resolveNextSystemInputTargetLanguage,
  resolveSystemInputTargetLanguageValue,
} from "@/services/systemInput/targetLanguageSwitcher";
import {
  createDefaultSystemInputStatus,
  type SystemInputSelectionCaptureResult,
  type SystemInputStatus,
  type SystemInputTranslationRequestEvent,
} from "@/types/systemInput";
import type { TranslateRequest, TranslateResult } from "@/types/ai";
import type { ModelConfig } from "@/types/app";

interface CachedSystemInputTranslation {
  requestKey: string;
  request: TranslateRequest;
  result: TranslateResult;
  modelName: string;
}

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
  const activeSessionId = ref<string | null>(null);
  const lastError = ref("");
  const lastWritebackError = ref("");
  const lastPresentedHint = ref("");
  const lastShortcutTranslation = ref("");
  const lastShortcutRequestKey = ref("");
  const lastSystemInputTranslation = ref<CachedSystemInputTranslation | null>(null);
  const shortcutActionRunning = ref(false);

  let stopConfigSync: (() => void) | null = null;
  let unlistenStatus: (() => void) | null = null;
  let unlistenTranslationRequest: (() => void) | null = null;
  let unlistenWritebackResult: (() => void) | null = null;
  const runningSystemInputRequestKeys = new Set<string>();

  const isEnabled = computed(() => appConfigStore.preferences.systemInput.enabled);
  const shouldAvoidInteractiveHintsDuringWriteback = computed(() => {
    const config = appConfigStore.preferences.systemInput;
    return config.autoReplace && config.writebackMode !== "popup-only";
  });

  function resolvePreferredModel(explicitModel?: ModelConfig | null) {
    const primaryModel =
      explicitModel ??
      appConfigStore.selectedTranslationModel ??
      appConfigStore.defaultModel;
    const fallbackModel =
      primaryModel &&
      appConfigStore.defaultModel &&
      primaryModel.id !== appConfigStore.defaultModel.id
        ? appConfigStore.defaultModel
        : null;

    return {
      primaryModel,
      fallbackModel,
    };
  }

  function buildShortcutRequest(sourceText: string): TranslateRequest {
    return {
      sourceText,
      sourceLanguage: appConfigStore.preferences.systemInput.sourceLanguage || "auto",
      targetLanguage: appConfigStore.preferences.systemInput.targetLanguage || "auto",
    };
  }

  function buildShortcutRequestKey(
    request: TranslateRequest,
    modelConfig: ModelConfig,
    origin: "selection" | "clipboard",
  ) {
    return JSON.stringify({
      origin,
      modelId: modelConfig.id,
      sourceText: request.sourceText,
      sourceLanguage: request.sourceLanguage,
      targetLanguage: request.targetLanguage,
    });
  }

  function resolveSystemInputRequestedTargetLanguage() {
    const configuredTargetLanguage = appConfigStore.preferences.systemInput.targetLanguage;

    if (configuredTargetLanguage.trim().length > 0) {
      return configuredTargetLanguage;
    }

    return appConfigStore.preferences.locale === "en-US" ? "English" : "Chinese (Simplified)";
  }

  function buildSystemInputRequest(event: SystemInputTranslationRequestEvent): TranslateRequest {
    return {
      sourceText: event.capturedText.preferredText,
      sourceLanguage: event.sourceLanguage || appConfigStore.preferences.systemInput.sourceLanguage || "auto",
      targetLanguage: event.targetLanguage || resolveSystemInputRequestedTargetLanguage(),
    };
  }

  function buildSystemInputRequestKey(
    event: SystemInputTranslationRequestEvent,
    modelConfig: ModelConfig,
  ) {
    const request = buildSystemInputRequest(event);

    return JSON.stringify({
      origin: "system-input",
      modelId: modelConfig.id,
      sourceText: request.sourceText,
      sourceLanguage: request.sourceLanguage,
      targetLanguage: request.targetLanguage,
    });
  }

  async function reuseLastShortcutTranslation(
    origin: "selection" | "clipboard",
    options?: {
      selectionContext?: SystemInputSelectionCaptureResult | null;
    },
  ) {
    if (!lastShortcutTranslation.value.trim()) {
      return false;
    }

    if (
      origin === "selection" &&
      appConfigStore.preferences.systemInput.replaceSelectionOnShortcutTranslate
    ) {
      const replaced = await pasteSystemInputText(
        lastShortcutTranslation.value,
        options?.selectionContext?.targetApp ?? null,
      );

      if (replaced) {
        lastWritebackError.value = "";
        await logger.info("external-input.shortcut.reuse", "复用上次快捷键译文并覆盖原文", {
          detail: {
            origin,
          },
        });
        await presentSystemNotification(
          "已跳过重复翻译",
          `源内容未变化，已直接复用上次译文。按 ${shortcutLabel("pasteLastTranslationShortcut")} 可再次粘贴。`,
        );
        return true;
      }

      lastWritebackError.value = "源内容未变化，已跳过重复翻译，但自动覆盖原文失败。";
      await logger.warn("external-input.shortcut.reuse-writeback-failed", "复用上次快捷键译文但回写失败", {
        detail: {
          origin,
        },
      });
      await presentSystemNotification(
        "已跳过重复翻译",
        `源内容未变化，可按 ${shortcutLabel("pasteLastTranslationShortcut")} 手动粘贴上次译文。`,
      );
      return true;
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

  async function reuseLastSystemInputTranslation(
    event: SystemInputTranslationRequestEvent,
    cachedTranslation: CachedSystemInputTranslation,
  ) {
    const writeback = await submitSystemInputTranslation({
      sessionId: event.sessionId,
      request: cachedTranslation.request,
      translatedText: cachedTranslation.result.text,
      displayText: cachedTranslation.result.text,
      sourceText: event.capturedText.preferredText,
      captureStrategy: event.capturedText.preferredStrategy,
      targetApp: event.targetApp ?? null,
      openResultWindowOnFailure: true,
    });

    lastWritebackError.value = writeback.error ?? "";

    if (
      writeback.fallbackWindowRequired ||
      appConfigStore.preferences.systemInput.showFloatingHint
    ) {
      await presentTranslationResultInResultWindow({
        modelName: cachedTranslation.modelName,
        request: cachedTranslation.request,
        result: cachedTranslation.result,
      });
    }
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

  async function ensureFeatureEnabledForShortcuts() {
    await ensureReadyForShortcuts();

    if (appConfigStore.preferences.systemInput.enabled) {
      return true;
    }

    await presentSystemNotification(
      "系统输入增强已关闭",
      `按 ${shortcutLabel("toggleEnabledShortcut")} 可以重新开启。`,
    );
    return false;
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

  async function translateFromShortcut(
    sourceText: string,
    origin: "selection" | "clipboard",
    options?: {
      selectionContext?: SystemInputSelectionCaptureResult | null;
    },
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
      await presentSystemNotification("系统输入增强忙碌中", "上一条快捷键翻译还没有完成。");
      return false;
    }

    const { primaryModel, fallbackModel } = resolvePreferredModel();

    if (!primaryModel) {
      lastError.value = "请先在模型设置中添加并启用至少一个模型。";
      await presentSystemNotification("翻译失败", lastError.value);
      return false;
    }

    const request = buildShortcutRequest(normalizedSourceText);
    const requestKey = buildShortcutRequestKey(request, primaryModel, origin);
    await logger.info("external-input.shortcut.translate.start", "快捷键翻译开始", {
      detail: {
        origin,
        modelId: primaryModel.id,
        sourceText: summarizeTranslationText(normalizedSourceText),
      },
    });

    if (lastShortcutRequestKey.value === requestKey) {
      return await reuseLastShortcutTranslation(origin, options);
    }

    shortcutActionRunning.value = true;
    lastError.value = "";

    try {
      let resolvedRequest = await translationStore.resolveRequest(request, primaryModel);
      let activeModel = primaryModel;
      let result;

      try {
        result = await translationStore.translateDetached(resolvedRequest, activeModel);
      } catch (error) {
        if (!fallbackModel) {
          throw error;
        }

        await logger.warn("provider.fallback", "系统输入快捷键翻译已回退到默认模型", {
          category: "provider",
          detail: {
            origin,
            primaryModelId: activeModel.id,
            fallbackModelId: fallbackModel.id,
            reason: error instanceof Error ? error.message : String(error),
          },
        });
        activeModel = fallbackModel;
        resolvedRequest = await translationStore.resolveRequest(request, activeModel);
        result = await translationStore.translateDetached(resolvedRequest, activeModel);
      }

      lastShortcutTranslation.value = result.text;
      lastShortcutRequestKey.value = requestKey;
      lastWritebackError.value = "";
      const resolutionSummary = formatTranslationResolutionSummary(resolvedRequest.resolution);
      await logger.info("external-input.shortcut.translate.success", "快捷键翻译完成", {
        detail: {
          origin,
          modelId: activeModel.id,
          modelName: activeModel.name,
          resolutionSummary,
          resultText: summarizeTranslationText(result.text),
        },
      });

      if (
        origin === "selection" &&
        appConfigStore.preferences.systemInput.replaceSelectionOnShortcutTranslate
      ) {
        const replaced = await pasteSystemInputText(
          result.text,
          options?.selectionContext?.targetApp ?? null,
        );

        if (replaced) {
          await logger.info("external-input.shortcut.writeback.success", "快捷键译文已自动覆盖原文", {
            detail: {
              origin,
            },
          });
          await presentSystemNotification(
            "选中文本已翻译并覆盖原文",
            resolutionSummary
              ? `${resolutionSummary} 译文已保存，按 ${shortcutLabel("pasteLastTranslationShortcut")} 可再次粘贴。`
              : `译文已保存，按 ${shortcutLabel("pasteLastTranslationShortcut")} 可再次粘贴。`,
          );
          return true;
        }

        lastWritebackError.value = "翻译完成，但自动覆盖原文失败。";
        await logger.warn("external-input.shortcut.writeback.failed", "快捷键译文自动覆盖原文失败", {
          detail: {
            origin,
          },
        });
        await presentSystemNotification(
          "翻译完成，但自动覆盖失败",
          resolutionSummary
            ? `${resolutionSummary} 可按 ${shortcutLabel("pasteLastTranslationShortcut")} 手动粘贴译文。`
            : `可按 ${shortcutLabel("pasteLastTranslationShortcut")} 手动粘贴译文。`,
        );
        return true;
      }

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
        errorStack: error instanceof Error ? error.stack : String(error),
      });
      await presentSystemNotification("翻译失败", lastError.value);
      return false;
    } finally {
      shortcutActionRunning.value = false;
    }
  }

  async function presentHint(message: string, options?: { request?: {
    sourceText: string;
    sourceLanguage: string;
    targetLanguage: string;
  } | null }) {
    if (!appConfigStore.preferences.systemInput.showFloatingHint || !message.trim()) {
      return;
    }

    if (lastPresentedHint.value === message) {
      return;
    }

    lastPresentedHint.value = message;
    await presentTranslationResultInResultWindow({
      modelName: "系统输入增强",
      request: options?.request ?? {
        sourceText: "",
        sourceLanguage: appConfigStore.preferences.systemInput.sourceLanguage,
        targetLanguage: appConfigStore.preferences.systemInput.targetLanguage,
      },
      result: {
        text: message,
        model: "system-input",
        provider: "openai-compatible",
        raw: null,
      },
    });
  }

  async function handleTranslationRequest(event: SystemInputTranslationRequestEvent) {
    const { primaryModel } = resolvePreferredModel();
    const requestKey = primaryModel ? buildSystemInputRequestKey(event, primaryModel) : "";
    const cachedSystemInputTranslation =
      requestKey && lastSystemInputTranslation.value?.requestKey === requestKey
        ? lastSystemInputTranslation.value
        : null;

    if (requestKey && runningSystemInputRequestKeys.has(requestKey)) {
      await logger.warn("external-input.session.duplicate", "系统输入会话命中重复请求，已取消新会话", {
        detail: {
          sessionId: event.sessionId,
        },
      });
      await cancelSystemInputSession({
        sessionId: event.sessionId,
      });
      return;
    }

    activeSessionId.value = event.sessionId;
    lastError.value = "";
    lastPresentedHint.value = "";
    await logger.info("external-input.session.start", "系统输入翻译会话开始", {
      detail: {
        sessionId: event.sessionId,
        requestKey,
        sourceText: summarizeTranslationText(event.capturedText.preferredText),
        sourceLanguage: event.sourceLanguage,
        targetLanguage: event.targetLanguage,
      },
    });

    if (cachedSystemInputTranslation) {
      try {
        await reuseLastSystemInputTranslation(event, cachedSystemInputTranslation);
      } catch (error) {
        lastError.value = error instanceof Error ? error.message : "系统输入增强翻译失败。";
        await logger.error("external-input.session.reuse-failed", "复用系统输入译文失败", {
          detail: {
            sessionId: event.sessionId,
          },
          errorStack: error instanceof Error ? error.stack : String(error),
        });
        await cancelSystemInputSession({
          sessionId: event.sessionId,
          error: lastError.value,
        });
        await presentHint(lastError.value, {
          request: {
            sourceText: event.capturedText.preferredText,
            sourceLanguage: event.sourceLanguage,
            targetLanguage: event.targetLanguage,
          },
        });
      } finally {
        activeSessionId.value = null;
      }
      return;
    }

    if (!shouldAvoidInteractiveHintsDuringWriteback.value) {
      await presentHint("正在翻译，请稍候…", {
        request: {
          sourceText: event.capturedText.preferredText,
          sourceLanguage: event.sourceLanguage,
          targetLanguage: event.targetLanguage,
        },
      });
    }

    if (requestKey) {
      runningSystemInputRequestKeys.add(requestKey);
    }

    try {
      const sessionResult = await runSystemInputTranslationSession(event, {
        appConfigStore,
        translationStore,
      });

      if (requestKey && sessionResult) {
        lastSystemInputTranslation.value = {
          requestKey,
          request: sessionResult.request,
          result: sessionResult.result,
          modelName: sessionResult.modelName,
        };
      }

      lastWritebackError.value = sessionResult?.writeback.error ?? "";
      await logger.info("external-input.session.success", "系统输入翻译会话完成", {
        detail: {
          sessionId: event.sessionId,
          hasResult: Boolean(sessionResult),
          writebackError: sessionResult?.writeback.error ?? null,
        },
      });
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : "系统输入增强翻译失败。";
      await logger.error("external-input.session.failed", "系统输入翻译会话失败", {
        detail: {
          sessionId: event.sessionId,
        },
        errorStack: error instanceof Error ? error.stack : String(error),
      });
      await cancelSystemInputSession({
        sessionId: event.sessionId,
        error: lastError.value,
      });
      await presentHint(lastError.value, {
        request: {
          sourceText: event.capturedText.preferredText,
          sourceLanguage: event.sourceLanguage,
          targetLanguage: event.targetLanguage,
        },
        });
    } finally {
      if (requestKey) {
        runningSystemInputRequestKeys.delete(requestKey);
      }
      activeSessionId.value = null;
    }
  }

  async function syncConfigToNative() {
    if (syncing.value) {
      return;
    }

    syncing.value = true;

    try {
      status.value = await updateSystemInputNativeConfig(appConfigStore.preferences.systemInput);
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : "同步系统输入增强配置失败。";
      await logger.error("external-input.config.sync-failed", "同步系统输入增强配置失败", {
        detail: {
          config: appConfigStore.preferences.systemInput,
        },
        errorStack: error instanceof Error ? error.stack : String(error),
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
      lastError.value = error instanceof Error ? error.message : "读取系统输入增强状态失败。";
      await logger.warn("external-input.status.refresh-failed", "读取系统输入增强状态失败", {
        errorStack: error instanceof Error ? error.stack : String(error),
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
      unlistenStatus = await listenSystemInputStatus((payload) => {
        const previousError = status.value.lastError;
        status.value = payload;

        if (payload.lastError) {
          lastError.value = payload.lastError;

          if (payload.lastError !== previousError && !activeSessionId.value) {
            void presentHint(payload.lastError);
          }
        }
      });

      unlistenTranslationRequest = await listenSystemInputTranslationRequest((payload) => {
        void handleTranslationRequest(payload);
      });

      unlistenWritebackResult = await listenSystemInputWritebackResult((payload) => {
        if (payload.error) {
          lastWritebackError.value = payload.error;
        } else {
          lastWritebackError.value = "";
        }
      });

      status.value = await initializeSystemInputNative({
        config: appConfigStore.preferences.systemInput,
        appWindowLabels: resolveSystemInputExcludedWindowLabels(),
      });

      stopConfigSync = watch(
        () => appConfigStore.preferences.systemInput,
        () => {
          void syncConfigToNative();
        },
        { deep: true },
      );
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : "初始化系统输入增强失败。";

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
      const selectionContext = await captureSystemSelectedTextWithContext();
      const fallbackSelectedText = selectionContext?.text ?? await captureSystemSelectedText();
      return await translateFromShortcut(fallbackSelectedText ?? "", "selection", {
        selectionContext,
      });
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : "读取选中文本失败。";
      await logger.error("external-input.shortcut.capture-selection-failed", "读取选中文本失败", {
        errorStack: error instanceof Error ? error.stack : String(error),
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
        errorStack: error instanceof Error ? error.stack : String(error),
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
        nextEnabled ? "系统输入增强已开启" : "系统输入增强已关闭",
        nextEnabled
          ? `${shortcutLabel("translateSelectionShortcut")} 选中翻译，${shortcutLabel("translateClipboardShortcut")} 剪贴板翻译，${shortcutLabel("pasteLastTranslationShortcut")} 粘贴译文。`
          : `按 ${shortcutLabel("toggleEnabledShortcut")} 可以重新开启。`,
      );
      await logger.info("external-input.toggle", "系统输入增强状态已切换", {
        detail: {
          enabled: nextEnabled,
        },
      });

      return nextEnabled;
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : "切换系统输入增强失败。";
      await logger.error("external-input.toggle.failed", "切换系统输入增强失败", {
        errorStack: error instanceof Error ? error.stack : String(error),
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

    const overlayActive = hasPendingOverlaySession ||
      await isSystemInputTargetLanguageOverlayActive();

    try {
      await ensureReadyForShortcuts();

      const currentTargetLanguage = resolveSystemInputTargetLanguageValue(
        appConfigStore.preferences.systemInput.targetLanguage,
      );
      const nextTargetLanguage = overlayActive
        ? resolveNextSystemInputTargetLanguage(currentTargetLanguage)
        : currentTargetLanguage;

      if (nextTargetLanguage !== appConfigStore.preferences.systemInput.targetLanguage) {
        await appConfigStore.updateSystemInputConfig({
          targetLanguage: nextTargetLanguage,
        });
      }

      await showSystemInputTargetLanguageOverlay(
        createSystemInputTargetLanguageOverlayPayload(nextTargetLanguage),
      );
      await logger.info("external-input.target-language.switch", "系统输入目标语言快捷切换完成", {
        detail: {
          nextTargetLanguage,
          overlayActive,
        },
      });

      return nextTargetLanguage;
    } catch (error) {
      clearSystemInputTargetLanguageOverlaySession();
      lastError.value = error instanceof Error ? error.message : "切换目标语言失败。";
      await logger.error("external-input.target-language.switch-failed", "系统输入目标语言切换失败", {
        errorStack: error instanceof Error ? error.stack : String(error),
      });
      await presentSystemNotification("切换目标语言失败", lastError.value);
      return resolveSystemInputTargetLanguageValue(
        appConfigStore.preferences.systemInput.targetLanguage,
      );
    }
  }

  function dispose() {
    stopConfigSync?.();
    stopConfigSync = null;
    unlistenStatus?.();
    unlistenStatus = null;
    unlistenTranslationRequest?.();
    unlistenTranslationRequest = null;
    unlistenWritebackResult?.();
    unlistenWritebackResult = null;
    lastShortcutRequestKey.value = "";
    lastSystemInputTranslation.value = null;
    runningSystemInputRequestKeys.clear();
    initialized.value = false;
  }

  return {
    initialized,
    syncing,
    status,
    activeSessionId,
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
