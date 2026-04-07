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

  if (request.sourceImage) {
    return request.sourceText.trim()
      ? [
          "The user provided an image and additional plain text.",
          "Read all visible text in the image with OCR.",
          `Determine whether the source content is already in ${systemLanguage}.`,
          `If the source content is already in ${systemLanguage}, translate both the image text and the additional plain text into English.`,
          `Otherwise, translate both the image text and the additional plain text into ${translateTarget}.`,
          "Present the image-derived translation first, then the plain-text translation.",
        ].join(" ")
      : [
          "The user provided an image.",
          "Read all visible text in the image with OCR.",
          `Determine whether the source content is already in ${systemLanguage}.`,
          `If the source content is already in ${systemLanguage}, translate it into English.`,
          `Otherwise, translate it into ${translateTarget}.`,
        ].join(" ");
  }

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
    : request.sourceImage
      ? request.sourceText.trim()
        ? [
            "The user provided an image and additional plain text.",
            `Read all visible text in the image with OCR, then translate both the image text and the additional plain text into ${request.targetLanguage}.`,
            "Present the image-derived translation first, then the plain-text translation.",
          ].join(" ")
        : `The user provided an image. Read all visible text in the image with OCR, then translate it into ${request.targetLanguage}.`
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

  if (!request.sourceImage) {
    return {
      role: "user",
      content: [instructions, "", "Text:", request.sourceText].join("\n"),
    };
  }

  const extraTextBlock = request.sourceText.trim()
    ? `\n\nAdditional plain text:\n${request.sourceText}`
    : "";

  return {
    role: "user",
    content: [
      {
        type: "text",
        text: `${instructions}${extraTextBlock}`,
      },
      {
        type: "image_url",
        image_url: {
          url: request.sourceImage.dataUrl,
          detail: "high",
        },
      },
    ],
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
