import { ref, watch } from "vue";
import { acceptHMRUpdate, defineStore } from "pinia";
import { createLogger, createRequestId, createTraceId } from "@/services/logging/logger";
import { summarizeTranslationText } from "@/services/logging/logSanitizer";
import { translateText } from "@/services/ai/translationService";
import { resolveTranslationRequest } from "@/services/ai/translationRequestResolver";
import { useAppConfigStore } from "@/stores/appConfig";
import { generateId } from "@/utils/id";
import { toErrorStack } from "@/utils/error";
import {
  clearTranslationCache,
  loadCachedTranslation,
  saveCachedTranslation,
  trimTranslationCache,
} from "@/services/storage/translationCacheStorage";
import {
  clearTranslationHistory,
  loadTranslationHistory,
  saveTranslationHistory,
} from "@/services/storage/translationHistoryStorage";
import type { TranslateRequest, TranslateResult, TranslationHistoryItem } from "@/types/ai";
import type { ModelConfig } from "@/types/app";

const TRANSLATION_HISTORY_SYNC_CHANNEL = "ai-assistant:translation-history";
const TRANSLATION_HISTORY_SYNC_SOURCE = generateId();

let historySyncChannel: BroadcastChannel | null = null;
const logger = createLogger({
  source: "store",
  category: "translation",
});

function getHistorySyncChannel() {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }

  historySyncChannel ??= new BroadcastChannel(TRANSLATION_HISTORY_SYNC_CHANNEL);
  return historySyncChannel;
}

function isResolvedRequest(request: TranslateRequest) {
  return Boolean(
    request.resolution &&
      request.sourceLanguage === request.resolution.resolvedSourceLanguage &&
      request.targetLanguage === request.resolution.resolvedTargetLanguage,
  );
}

export const useTranslationStore = defineStore("translation", () => {
  const appConfigStore = useAppConfigStore();
  const loading = ref(false);
  const errorMessage = ref("");
  const currentResult = ref<TranslateResult | null>(null);
  const currentModelName = ref("");
  const currentRequest = ref<TranslateRequest | null>(null);
  const history = ref<TranslationHistoryItem[]>([]);
  const initialized = ref(false);
  let stopHistorySync: (() => void) | null = null;

  async function persistHistory() {
    await saveTranslationHistory(history.value, appConfigStore.preferences.historyLimit);
    getHistorySyncChannel()?.postMessage({
      source: TRANSLATION_HISTORY_SYNC_SOURCE,
      updatedAt: new Date().toISOString(),
    });
  }

  async function hydrateHistoryFromStorage() {
    history.value = await loadTranslationHistory(appConfigStore.preferences.historyLimit);
  }

  function ensureHistorySync() {
    if (stopHistorySync) {
      return;
    }

    const channel = getHistorySyncChannel();

    if (!channel) {
      return;
    }

    const handleMessage = (event: MessageEvent<{ source?: string }>) => {
      if (event.data?.source === TRANSLATION_HISTORY_SYNC_SOURCE) {
        return;
      }

      void hydrateHistoryFromStorage();
    };

    channel.addEventListener("message", handleMessage);
    stopHistorySync = () => {
      channel.removeEventListener("message", handleMessage);
    };
  }

  function buildHistoryRequest(request: TranslateRequest) {
    return {
      sourceText: request.sourceText,
      sourceLanguage: request.sourceLanguage,
      targetLanguage: request.targetLanguage,
      resolution: request.resolution ?? null,
      hasSourceImage: Boolean(request.sourceImage),
      sourceImageName: request.sourceImage?.name,
      sourceImage: request.sourceImage
        ? {
            dataUrl: request.sourceImage.dataUrl,
            mimeType: request.sourceImage.mimeType,
            name: request.sourceImage.name,
          }
        : null,
    };
  }

  function buildHistoryDedupKey(item: Pick<TranslationHistoryItem, "modelId" | "request">) {
    return JSON.stringify({
      modelId: item.modelId,
      sourceText: item.request.sourceText,
      sourceLanguage: item.request.sourceLanguage,
      targetLanguage: item.request.targetLanguage,
      requestedSourceLanguage: item.request.resolution?.requestedSourceLanguage ?? "",
      requestedTargetLanguage: item.request.resolution?.requestedTargetLanguage ?? "",
      hasSourceImage: item.request.hasSourceImage,
      sourceImageName: item.request.sourceImageName ?? "",
      sourceImageDataUrl: item.request.sourceImage?.dataUrl ?? "",
    });
  }

  async function pushHistoryEntry(
    request: TranslateRequest,
    result: TranslateResult,
    modelConfig: ModelConfig,
  ) {
    const nextEntry: TranslationHistoryItem = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      modelId: modelConfig.id,
      modelName: modelConfig.name,
      request: buildHistoryRequest(request),
      result: {
        ...result,
        raw: null,
      },
    };
    const nextEntryKey = buildHistoryDedupKey(nextEntry);

    history.value = [
      nextEntry,
      ...history.value.filter((item) => buildHistoryDedupKey(item) !== nextEntryKey),
    ].slice(0, appConfigStore.preferences.historyLimit);

    await persistHistory();
  }

  async function initialize() {
    ensureHistorySync();

    if (initialized.value) {
      return;
    }

    if (!appConfigStore.initialized) {
      await appConfigStore.initialize();
    }

    await hydrateHistoryFromStorage();
    await trimTranslationCache(appConfigStore.preferences.historyLimit);
    initialized.value = true;
  }

  async function setHistoryLimit(limit: number) {
    history.value = history.value.slice(0, limit);
    await persistHistory();
    await trimTranslationCache(limit);
  }

  async function clearHistory() {
    history.value = [];
    await Promise.all([clearTranslationHistory(), clearTranslationCache()]);
    getHistorySyncChannel()?.postMessage({
      source: TRANSLATION_HISTORY_SYNC_SOURCE,
      updatedAt: new Date().toISOString(),
    });
    await logger.warn("translation.history.clear", "翻译历史与缓存已清空", {
      category: "storage",
    });
  }

  watch(
    () => appConfigStore.preferences.historyLimit,
    (limit) => {
      if (!initialized.value) {
        return;
      }

      void setHistoryLimit(limit);
    },
  );

  async function resolveRequest(request: TranslateRequest, modelConfig?: ModelConfig | null) {
    await initialize();
    const activeModelConfig =
      modelConfig ?? appConfigStore.selectedTranslationModel ?? appConfigStore.defaultModel;

    if (!activeModelConfig) {
      throw new Error("请先在模型设置中添加并启用至少一个模型。");
    }

    if (isResolvedRequest(request)) {
      return request;
    }

    const { resolvedRequest } = await resolveTranslationRequest(activeModelConfig, request);
    await logger.info("translation.request.resolve", "翻译请求语言解析完成", {
      detail: {
        modelId: activeModelConfig.id,
        requestedSourceLanguage: request.sourceLanguage,
        requestedTargetLanguage: request.targetLanguage,
        resolvedSourceLanguage: resolvedRequest.sourceLanguage,
        resolvedTargetLanguage: resolvedRequest.targetLanguage,
        resolution: resolvedRequest.resolution,
      },
    });
    return resolvedRequest;
  }

  async function executeTranslation(
    request: TranslateRequest,
    modelConfig?: ModelConfig | null,
    options?: {
      updateVisibleState?: boolean;
    },
  ) {
    await initialize();
    const activeModelConfig =
      modelConfig ?? appConfigStore.selectedTranslationModel ?? appConfigStore.defaultModel;
    const updateVisibleState = options?.updateVisibleState ?? true;

    if (!activeModelConfig) {
      throw new Error("请先在模型设置中添加并启用至少一个模型。");
    }

    const previousResult = currentResult.value;
    const previousModelName = currentModelName.value;
    const previousRequest = currentRequest.value;
    let streamedText = "";
    const traceId = createTraceId();
    const requestId = createRequestId();

    if (updateVisibleState) {
      loading.value = true;
      errorMessage.value = "";
      currentModelName.value = activeModelConfig.name;
      currentRequest.value = request;
    }

    try {
      await logger.info("translation.request.start", "翻译请求开始", {
        requestId,
        traceId,
        detail: {
          modelId: activeModelConfig.id,
          modelName: activeModelConfig.name,
          provider: activeModelConfig.provider,
          sourceLanguage: request.sourceLanguage,
          targetLanguage: request.targetLanguage,
          sourceText: summarizeTranslationText(request.sourceText),
          hasSourceImage: Boolean(request.sourceImage),
        },
      });

      const resolvedRequest = isResolvedRequest(request)
        ? request
        : (await resolveTranslationRequest(activeModelConfig, request)).resolvedRequest;

      if (updateVisibleState) {
        currentRequest.value = resolvedRequest;
      }

      try {
        const cachedResult = await loadCachedTranslation(activeModelConfig, resolvedRequest);

        if (cachedResult) {
          await logger.info("translation.cache.hit", "翻译缓存命中", {
            category: "cache",
            requestId,
            traceId,
            success: true,
            detail: {
              modelId: activeModelConfig.id,
              sourceText: summarizeTranslationText(resolvedRequest.sourceText),
            },
          });
          if (updateVisibleState) {
            currentResult.value = cachedResult;
            currentModelName.value = activeModelConfig.name;
            currentRequest.value = resolvedRequest;
          }
          await pushHistoryEntry(resolvedRequest, cachedResult, activeModelConfig);
          return cachedResult;
        }
        await logger.info("translation.cache.miss", "翻译缓存未命中", {
          category: "cache",
          requestId,
          traceId,
          success: false,
          detail: {
            modelId: activeModelConfig.id,
            sourceText: summarizeTranslationText(resolvedRequest.sourceText),
          },
        });
      } catch (error) {
        await logger.warn("translation.cache.read-failed", "读取翻译缓存失败", {
          category: "cache",
          requestId,
          traceId,
          errorStack: toErrorStack(error),
        });
      }

      if (updateVisibleState) {
        currentResult.value = {
          text: "",
          model: activeModelConfig.model,
          provider: activeModelConfig.provider,
          usage: undefined,
          raw: null,
        };
      }

      try {
        const result = await translateText(
          activeModelConfig,
          resolvedRequest,
          updateVisibleState
            ? {
                onTextDelta(delta) {
                  if (!delta) {
                    return;
                  }

                  streamedText += delta;
                  currentResult.value = currentResult.value
                    ? {
                        ...currentResult.value,
                        text: streamedText,
                      }
                    : {
                        text: streamedText,
                        model: activeModelConfig.model,
                        provider: activeModelConfig.provider,
                        usage: undefined,
                        raw: null,
                      };
                },
              }
            : undefined,
          {
            requestId,
            traceId,
            detailedLogging: appConfigStore.preferences.logging.detailedRequestLogging,
          },
        );

        if (updateVisibleState) {
          currentResult.value = result;
          currentModelName.value = activeModelConfig.name;
        }

        try {
          await saveCachedTranslation(
            activeModelConfig,
            resolvedRequest,
            result,
            appConfigStore.preferences.historyLimit,
          );
        } catch (error) {
          await logger.warn("translation.cache.write-failed", "写入翻译缓存失败", {
            category: "cache",
            requestId,
            traceId,
            errorStack: toErrorStack(error),
          });
        }

        await pushHistoryEntry(resolvedRequest, result, activeModelConfig);
        await logger.info("translation.request.success", "翻译请求完成", {
          requestId,
          traceId,
          success: true,
          detail: {
            modelId: activeModelConfig.id,
            provider: result.provider,
            resultText: summarizeTranslationText(result.text),
            usage: result.usage,
          },
        });

        return result;
      } catch (error) {
        if (updateVisibleState && !streamedText) {
          currentResult.value = previousResult;
          currentModelName.value = previousModelName;
          currentRequest.value = previousRequest;
        }

        if (updateVisibleState) {
          errorMessage.value = error instanceof Error ? error.message : "翻译请求失败。";
        }
        await logger.error("translation.request.failed", "翻译请求失败", {
          requestId,
          traceId,
          success: false,
          detail: {
            modelId: activeModelConfig.id,
            sourceText: summarizeTranslationText(resolvedRequest.sourceText),
          },
          errorStack: toErrorStack(error),
        });
        throw error;
      }
    } finally {
      if (updateVisibleState) {
        loading.value = false;
      }
    }
  }

  async function translate(request: TranslateRequest, modelConfig?: ModelConfig | null) {
    return await executeTranslation(request, modelConfig, {
      updateVisibleState: true,
    });
  }

  async function translateDetached(request: TranslateRequest, modelConfig?: ModelConfig | null) {
    return await executeTranslation(request, modelConfig, {
      updateVisibleState: false,
    });
  }

  function presentResult(
    result: TranslateResult,
    modelName: string,
    request?: TranslateRequest | null,
  ) {
    currentResult.value = result;
    currentModelName.value = modelName;
    currentRequest.value = request ?? currentRequest.value;
    errorMessage.value = "";
    loading.value = false;
  }

  function clearResult() {
    currentResult.value = null;
    currentModelName.value = "";
    currentRequest.value = null;
    errorMessage.value = "";
    loading.value = false;
  }

  return {
    loading,
    errorMessage,
    currentResult,
    currentModelName,
    currentRequest,
    history,
    initialized,
    initialize,
    resolveRequest,
    translate,
    translateDetached,
    presentResult,
    clearResult,
    setHistoryLimit,
    clearHistory,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useTranslationStore, import.meta.hot));
  import.meta.hot.dispose(() => {
    historySyncChannel?.close();
    historySyncChannel = null;
  });
}
