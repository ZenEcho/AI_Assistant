import { createAIProvider } from "@/services/ai/providerFactory";
import type {
  ChatCompletionStreamHandlers,
  ChatMessage,
  TranslateRequest,
  TranslateResult,
} from "@/types/ai";
import type { ModelConfig } from "@/types/app";

function buildTranslationInstructions(request: TranslateRequest): string {
  const sourceLanguage =
    request.sourceLanguage === "auto"
      ? "Automatically detect the source language."
      : `The source language is ${request.sourceLanguage}.`;
  const imageModeInstruction = request.sourceImage
    ? request.sourceText.trim()
      ? [
          `The user provided an image and additional plain text.`,
          `Read all visible text in the image with OCR, then translate both the image text and the additional plain text into ${request.targetLanguage}.`,
          "Present the image-derived translation first, then the plain-text translation.",
        ].join(" ")
      : `The user provided an image. Read all visible text in the image with OCR, then translate it into ${request.targetLanguage}.`
    : `Translate the following content into ${request.targetLanguage}.`;

  return [
    imageModeInstruction,
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
): Promise<TranslateResult> {
  const provider = createAIProvider(modelConfig);
  const response = await provider.completeChat(modelConfig, {
    messages: [
      {
        role: "system",
        content: modelConfig.systemPrompt,
      },
      buildTranslationUserMessage(request),
    ],
  }, handlers);

  return {
    text: response.content,
    model: response.model ?? modelConfig.model,
    provider: modelConfig.provider,
    usage: response.usage,
    raw: response.raw,
  };
}
