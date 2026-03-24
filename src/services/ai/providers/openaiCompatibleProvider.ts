import { invoke } from "@tauri-apps/api/core";
import type {
  ChatCompletionRequest,
  ChatCompletionResult,
  OpenAICompatibleCommandPayload,
  OpenAICompatibleCommandResponse,
} from "@/types/ai";
import type { ModelConfig } from "@/types/app";
import type { AIProvider } from "@/services/ai/providers/base";

export class OpenAICompatibleProvider implements AIProvider {
  readonly type = "openai-compatible" as const;

  async completeChat(
    modelConfig: ModelConfig,
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResult> {
    const payload: OpenAICompatibleCommandPayload = {
      baseUrl: modelConfig.baseUrl,
      apiKey: modelConfig.apiKey,
      model: modelConfig.model,
      messages: request.messages,
      temperature: request.temperature ?? modelConfig.temperature,
      maxTokens: request.maxTokens ?? modelConfig.maxTokens,
      timeoutMs: modelConfig.timeoutMs,
      extraHeaders: modelConfig.extraHeaders,
    };

    try {
      const response = await invoke<OpenAICompatibleCommandResponse>(
        "request_openai_compatible_completion",
        { payload },
      );

      return {
        id: response.id,
        model: response.model ?? modelConfig.model,
        content: response.content.trim(),
        usage: response.usage,
        raw: response.raw,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message || "调用 OpenAI Compatible 接口失败。");
    }
  }
}
