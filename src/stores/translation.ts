import { ref, watch } from "vue";
import { acceptHMRUpdate, defineStore } from "pinia";
import { translateText } from "@/services/ai/translationService";
import { useAppConfigStore } from "@/stores/appConfig";
import {
  clearTranslationHistory,
  loadTranslationHistory,
  saveTranslationHistory,
} from "@/services/storage/translationHistoryStorage";
import type { TranslateRequest, TranslateResult, TranslationHistoryItem } from "@/types/ai";
import type { ModelConfig } from "@/types/app";

export const useTranslationStore = defineStore("translation", () => {
  const appConfigStore = useAppConfigStore();
  const loading = ref(false);
  const errorMessage = ref("");
  const currentResult = ref<TranslateResult | null>(null);
  const currentModelName = ref("");
  const history = ref<TranslationHistoryItem[]>([]);
  const initialized = ref(false);

  async function persistHistory() {
    await saveTranslationHistory(history.value, appConfigStore.preferences.historyLimit);
  }

  async function initialize() {
    if (initialized.value) {
      return;
    }

    if (!appConfigStore.initialized) {
      await appConfigStore.initialize();
    }

    history.value = await loadTranslationHistory(appConfigStore.preferences.historyLimit);
    initialized.value = true;
  }

  async function setHistoryLimit(limit: number) {
    history.value = history.value.slice(0, limit);
    await persistHistory();
  }

  async function clearHistory() {
    history.value = [];
    await clearTranslationHistory();
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
      history.value.unshift({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        modelName: activeModelConfig.name,
        request: {
          sourceText: request.sourceText,
          sourceLanguage: request.sourceLanguage,
          targetLanguage: request.targetLanguage,
          hasSourceImage: Boolean(request.sourceImage),
          sourceImageName: request.sourceImage?.name,
        },
        result: {
          ...result,
          raw: null,
        },
      });
      history.value = history.value.slice(0, appConfigStore.preferences.historyLimit);
      await persistHistory();

      return result;
    } catch (error) {
      if (!streamedText) {
        currentResult.value = previousResult;
        currentModelName.value = previousModelName;
      }

      errorMessage.value = error instanceof Error ? error.message : "翻译请求失败。";
      throw error;
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
}
