import { ref } from "vue";
import { acceptHMRUpdate, defineStore } from "pinia";
import { translateText } from "@/services/ai/translationService";
import { useAppConfigStore } from "@/stores/appConfig";
import type { TranslateRequest, TranslateResult, TranslationHistoryItem } from "@/types/ai";
import type { ModelConfig } from "@/types/app";

export const useTranslationStore = defineStore("translation", () => {
  const loading = ref(false);
  const errorMessage = ref("");
  const currentResult = ref<TranslateResult | null>(null);
  const currentModelName = ref("");
  const history = ref<TranslationHistoryItem[]>([]);

  async function translate(request: TranslateRequest, modelConfig?: ModelConfig | null) {
    const appConfigStore = useAppConfigStore();
    const activeModelConfig = modelConfig ?? appConfigStore.defaultModel;

    if (!activeModelConfig) {
      throw new Error("请先在模型设置中添加并启用至少一个模型。");
    }

    loading.value = true;
    errorMessage.value = "";

    try {
      const result = await translateText(activeModelConfig, request);
      currentResult.value = result;
      currentModelName.value = activeModelConfig.name;
      history.value.unshift({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        modelName: activeModelConfig.name,
        request,
        result,
      });
      history.value = history.value.slice(0, 8);

      return result;
    } catch (error) {
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
    translate,
    clearResult,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useTranslationStore, import.meta.hot));
}
