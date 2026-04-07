import { createAIProvider } from "@/services/ai/providerFactory";
import { createLogger } from "@/services/logging/logger";
import { summarizeTranslationText } from "@/services/logging/logSanitizer";
import type {
  ChatCompletionStreamHandlers,
  ChatMessage,
  TranslateRequest,
  TranslateResult,
} from "@/types/ai";
import type { ModelConfig } from "@/types/app";

const logger = createLogger({
  source: "service",
  category: "translation",
});

function buildAutoTargetInstruction(request: TranslateRequest) {
  const systemLanguage = request.resolution?.systemLanguage ?? request.targetLanguage;
  const translateTarget = request.targetLanguage;

  return [
    `Determine whether the source content is already in ${systemLanguage}.`,
    `If the source content is already in ${systemLanguage}, translate it into English.`,
    `Otherwise, translate the content into ${translateTarget}.`,
  ].join(" ");
}

function buildTranslationInstructions(request: TranslateRequest): string {
  const sourceLanguage =
    request.sourceLanguage === "auto"
      ? "Automatically detect the source language."
      : `The source language is ${request.sourceLanguage}.`;
  const translationInstruction = request.resolution?.usedAutoTarget
    ? buildAutoTargetInstruction(request)
    : `Translate the following content into ${request.targetLanguage}.`;

  return [
    translationInstruction,
    sourceLanguage,
    "Keep the original structure, punctuation, markdown, lists and line breaks.",
    "Return the translated text only. Do not add explanations or quotation marks.",
  ].join("\n");
}

function buildTranslationUserMessage(request: TranslateRequest): ChatMessage {
  const instructions = buildTranslationInstructions(request);

  return {
    role: "user",
    content: [instructions, "", "Text:", request.sourceText].join("\n"),
  };
}

export async function translateText(
  modelConfig: ModelConfig,
  request: TranslateRequest,
  handlers?: ChatCompletionStreamHandlers,
  meta?: {
    requestId?: string;
    traceId?: string;
    detailedLogging?: boolean;
  },
): Promise<TranslateResult> {
  const detailedLogging = meta?.detailedLogging ?? false;

  await logger.info("translation.service.dispatch", "Translation request dispatched", {
    requestId: meta?.requestId,
    traceId: meta?.traceId,
    detail: {
      modelId: modelConfig.id,
      provider: modelConfig.provider,
      sourceLanguage: request.sourceLanguage,
      targetLanguage: request.targetLanguage,
      sourceText: summarizeTranslationText(request.sourceText),
      stream: Boolean(handlers?.onTextDelta),
      detailedLogging,
    },
  });

  const provider = createAIProvider(modelConfig);
  const response = await provider.completeChat(modelConfig, {
    messages: [
      {
        role: "system",
        content: modelConfig.systemPrompt,
      },
      buildTranslationUserMessage(request),
    ],
    requestId: meta?.requestId,
    traceId: meta?.traceId,
    detailedLogging,
  }, handlers);

  return {
    text: response.content,
    model: response.model ?? modelConfig.model,
    provider: modelConfig.provider,
    usage: response.usage,
    raw: response.raw,
  };
}
