import { createAIProvider } from "@/services/ai/providerFactory";
import type { TranslateRequest, TranslateResult } from "@/types/ai";
import type { ModelConfig } from "@/types/app";

function buildTranslationPrompt(request: TranslateRequest): string {
  const sourceLanguage =
    request.sourceLanguage === "auto"
      ? "Automatically detect the source language."
      : `The source language is ${request.sourceLanguage}.`;

  return [
    `Translate the following content into ${request.targetLanguage}.`,
    sourceLanguage,
    "Keep the original structure, punctuation, markdown, lists and line breaks.",
    "Return the translated text only. Do not add explanations or quotation marks.",
    "",
    "Text:",
    request.sourceText,
  ].join("\n");
}

export async function translateText(
  modelConfig: ModelConfig,
  request: TranslateRequest,
): Promise<TranslateResult> {
  const provider = createAIProvider(modelConfig);
  const response = await provider.completeChat(modelConfig, {
    messages: [
      {
        role: "system",
        content: modelConfig.systemPrompt,
      },
      {
        role: "user",
        content: buildTranslationPrompt(request),
      },
    ],
    temperature: modelConfig.temperature,
    maxTokens: modelConfig.maxTokens,
  });

  return {
    text: response.content,
    model: response.model ?? modelConfig.model,
    provider: modelConfig.provider,
    usage: response.usage,
    raw: response.raw,
  };
}
