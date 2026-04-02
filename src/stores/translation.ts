import { ref, watch } from "vue";
import { acceptHMRUpdate, defineStore } from "pinia";
import { translateText } from "@/services/ai/translationService";
import { useAppConfigStore } from "@/stores/appConfig";
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
const TRANSLATION_HISTORY_SYNC_SOURCE =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `translation-history-${Date.now()}-${Math.random().toString(16).slice(2)}`;

let historySyncChannel: BroadcastChannel | null = null;

function getHistorySyncChannel() {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }

  historySyncChannel ??= new BroadcastChannel(TRANSLATION_HISTORY_SYNC_CHANNEL);
  return historySyncChannel;
}

export const useTranslationStore = defineStore("translation", () => {
  const appConfigStore = useAppConfigStore();
  const loading = ref(false);
  const errorMessage = ref("");
  const currentResult = ref<TranslateResult | null>(null);
  const currentModelName = ref("");
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

  async function translate(request: TranslateRequest, modelConfig?: ModelConfig | null) {
    await initialize();
    const activeModelConfig = modelConfig ?? appConfigStore.defaultModel;

    if (!activeModelConfig) {
      throw new Error("请先在模型设置中添加并启用至少一个模型。");
    }

    const previousResult = currentResult.value;
    const previousModelName = currentModelName.value;
    let streamedText = "";

    loading.value = true;
    errorMessage.value = "";
    currentModelName.value = activeModelConfig.name;

    try {
      try {
        const cachedResult = await loadCachedTranslation(activeModelConfig, request);

        if (cachedResult) {
          currentResult.value = cachedResult;
          await pushHistoryEntry(request, cachedResult, activeModelConfig);
          return cachedResult;
        }
      } catch (error) {
        console.warn("Failed to load cached translation", error);
      }

      currentResult.value = {
        text: "",
        model: activeModelConfig.model,
        provider: activeModelConfig.provider,
        usage: undefined,
        raw: null,
      };

      try {
        const result = await translateText(activeModelConfig, request, {
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
        });

        currentResult.value = result;
        currentModelName.value = activeModelConfig.name;

        try {
          await saveCachedTranslation(
            activeModelConfig,
            request,
            result,
            appConfigStore.preferences.historyLimit,
          );
        } catch (error) {
          console.warn("Failed to save translation cache", error);
        }

        await pushHistoryEntry(request, result, activeModelConfig);

        return result;
      } catch (error) {
        if (!streamedText) {
          currentResult.value = previousResult;
          currentModelName.value = previousModelName;
        }

        errorMessage.value = error instanceof Error ? error.message : "翻译请求失败。";
        throw error;
      }
    } finally {
      loading.value = false;
    }
  }

  function clearResult() {
    currentResult.value = null;
    currentModelName.value = "";
    errorMessage.value = "";
  }

  return {
    loading,
    errorMessage,
    currentResult,
    currentModelName,
    history,
    initialized,
    initialize,
    translate,
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
