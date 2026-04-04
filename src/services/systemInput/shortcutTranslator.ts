import { createLogger } from "@/services/logging/logger";
import { toErrorMessage } from "@/utils/error";
import type { TranslateRequest, TranslateResult } from "@/types/ai";
import type { ModelConfig } from "@/types/app";

const logger = createLogger({
  source: "store",
  category: "external-input",
});

export interface ShortcutRequestConfig {
  sourceLanguage: string;
  targetLanguage: string;
}

/**
 * 从 appConfigStore 的两个字段解析主/备模型，无副作用。
 */
export function resolvePreferredModels(
  selectedModel: ModelConfig | null | undefined,
  defaultModel: ModelConfig | null | undefined,
): { primaryModel: ModelConfig | null; fallbackModel: ModelConfig | null } {
  const primaryModel = selectedModel ?? defaultModel ?? null;
  const fallbackModel =
    primaryModel && defaultModel && primaryModel.id !== defaultModel.id
      ? defaultModel
      : null;

  return { primaryModel, fallbackModel };
}

/**
 * 根据源文本和快捷键配置构造翻译请求，无副作用。
 */
export function buildShortcutRequest(
  sourceText: string,
  config: ShortcutRequestConfig,
): TranslateRequest {
  return {
    sourceText,
    sourceLanguage: config.sourceLanguage || "auto",
    targetLanguage: config.targetLanguage || "auto",
  };
}

/**
 * 计算快捷键翻译的去重 key，用于判断是否可复用上次结果，无副作用。
 */
export function buildShortcutRequestKey(
  request: TranslateRequest,
  modelConfig: ModelConfig,
  origin: "selection" | "clipboard",
): string {
  return JSON.stringify({
    origin,
    modelId: modelConfig.id,
    sourceText: request.sourceText,
    sourceLanguage: request.sourceLanguage,
    targetLanguage: request.targetLanguage,
  });
}

interface ShortcutTranslationDeps {
  translationStore: {
    resolveRequest(request: TranslateRequest, model?: ModelConfig | null): Promise<TranslateRequest>;
    translateDetached(request: TranslateRequest, model?: ModelConfig | null): Promise<TranslateResult>;
  };
}

export interface ShortcutTranslationOutcome {
  translatedText: string;
  resolvedRequest: TranslateRequest;
  activeModel: ModelConfig;
}

/**
 * 执行快捷键翻译的核心链路：resolveRequest → translateDetached，并在主模型失败时自动回退到备用模型。
 * 不直接操作任何响应式状态，由调用方（store）负责状态更新和通知。
 */
export async function executeShortcutTranslation(
  input: {
    request: TranslateRequest;
    origin: "selection" | "clipboard";
    primaryModel: ModelConfig;
    fallbackModel: ModelConfig | null;
  },
  deps: ShortcutTranslationDeps,
): Promise<ShortcutTranslationOutcome> {
  const { request, origin, primaryModel, fallbackModel } = input;

  let resolvedRequest = await deps.translationStore.resolveRequest(request, primaryModel);
  let activeModel = primaryModel;
  let result: TranslateResult;

  try {
    result = await deps.translationStore.translateDetached(resolvedRequest, activeModel);
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
        reason: toErrorMessage(error),
      },
    });

    activeModel = fallbackModel;
    resolvedRequest = await deps.translationStore.resolveRequest(request, activeModel);
    result = await deps.translationStore.translateDetached(resolvedRequest, activeModel);
  }

  return { translatedText: result.text, resolvedRequest, activeModel };
}
