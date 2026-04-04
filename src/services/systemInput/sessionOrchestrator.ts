import { presentTranslationResultInResultWindow } from "@/services/window/windowManager";
import type { TranslateRequest, TranslateResult } from "@/types/ai";
import type { AppLocale, ModelConfig } from "@/types/app";
import type {
  SystemInputTranslationRequestEvent,
  SystemInputTranslationSessionResult,
} from "@/types/systemInput";
import { submitSystemInputTranslation } from "@/services/systemInput/nativeBridge";

interface TranslationStoreLike {
  resolveRequest(request: TranslateRequest, modelConfig?: ModelConfig | null): Promise<TranslateRequest>;
  translateDetached(request: TranslateRequest, modelConfig?: ModelConfig | null): Promise<TranslateResult>;
  presentResult(result: TranslateResult, modelName: string, request?: TranslateRequest | null): void;
}

interface AppConfigStoreLike {
  preferences: {
    locale: AppLocale;
    systemInput: {
      sourceLanguage: string;
      targetLanguage: string;
      showFloatingHint: boolean;
    };
  };
}

function resolveTargetLanguage(locale: AppLocale, configuredTargetLanguage: string): string {
  if (configuredTargetLanguage.trim().length > 0) {
    return configuredTargetLanguage;
  }

  return locale === "en-US" ? "English" : "Chinese (Simplified)";
}

function buildRequest(
  event: SystemInputTranslationRequestEvent,
  locale: AppLocale,
  configuredSourceLanguage: string,
  configuredTargetLanguage: string,
): TranslateRequest {
  return {
    sourceText: event.capturedText.preferredText,
    sourceLanguage: event.sourceLanguage || configuredSourceLanguage || "auto",
    targetLanguage: event.targetLanguage || resolveTargetLanguage(locale, configuredTargetLanguage),
  };
}

export async function runSystemInputTranslationSession(
  event: SystemInputTranslationRequestEvent,
  dependencies: {
    appConfigStore: AppConfigStoreLike;
    translationStore: TranslationStoreLike;
    primaryModel: ModelConfig;
    fallbackModel: ModelConfig | null;
  },
): Promise<SystemInputTranslationSessionResult> {
  const { primaryModel, fallbackModel } = dependencies;

  const request = buildRequest(
    event,
    dependencies.appConfigStore.preferences.locale,
    dependencies.appConfigStore.preferences.systemInput.sourceLanguage,
    dependencies.appConfigStore.preferences.systemInput.targetLanguage,
  );
  let resolvedRequest = await dependencies.translationStore.resolveRequest(request, primaryModel);
  let activeModel = primaryModel;
  let result: TranslateResult;

  try {
    result = await dependencies.translationStore.translateDetached(resolvedRequest, activeModel);
  } catch (error) {
    if (!fallbackModel) {
      throw error;
    }

    activeModel = fallbackModel;
    resolvedRequest = await dependencies.translationStore.resolveRequest(request, activeModel);
    result = await dependencies.translationStore.translateDetached(resolvedRequest, activeModel);
  }

  const writeback = await submitSystemInputTranslation({
    sessionId: event.sessionId,
    request: resolvedRequest,
    translatedText: result.text,
    displayText: result.text,
    sourceText: event.capturedText.preferredText,
    captureStrategy: event.capturedText.preferredStrategy,
    targetApp: event.targetApp ?? null,
    openResultWindowOnFailure: true,
  });

  if (
    writeback.fallbackWindowRequired ||
    dependencies.appConfigStore.preferences.systemInput.showFloatingHint
  ) {
    await presentTranslationResultInResultWindow({
      modelName: activeModel.name,
      request: resolvedRequest,
      result,
    });
  }

  return {
    requestEvent: event,
    request: resolvedRequest,
    result,
    modelName: activeModel.name,
    writeback,
  };
}
