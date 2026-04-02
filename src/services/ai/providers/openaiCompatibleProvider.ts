import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  ChatCompletionRequest,
  ChatCompletionResult,
  ChatCompletionStreamHandlers,
  OpenAICompatibleCommandPayload,
  OpenAICompatibleCommandResponse,
  OpenAICompatibleStreamEventPayload,
} from "@/types/ai";
import type { ModelConfig } from "@/types/app";
import type { AIProvider } from "@/services/ai/providers/base";

export class OpenAICompatibleProvider implements AIProvider {
  readonly type = "openai-compatible" as const;

  private mapResponse(
    response: OpenAICompatibleCommandResponse,
    fallbackModel: string,
  ): ChatCompletionResult {
    return {
      id: response.id,
      model: response.model ?? fallbackModel,
      content: response.content.trim(),
      usage: response.usage,
      raw: response.raw,
    };
  }

  async completeChat(
    modelConfig: ModelConfig,
    request: ChatCompletionRequest,
    handlers?: ChatCompletionStreamHandlers,
  ): Promise<ChatCompletionResult> {
    const payload: OpenAICompatibleCommandPayload = {
      baseUrl: modelConfig.baseUrl,
      apiKey: modelConfig.apiKey,
      model: modelConfig.model,
      messages: request.messages,
      timeoutMs: modelConfig.timeoutMs,
    };
    const requestId = crypto.randomUUID();
    let receivedDelta = false;
    const unlisten = await listen<OpenAICompatibleStreamEventPayload>(
      "openai-compatible-stream",
      (event) => {
        if (event.payload.requestId !== requestId) {
          return;
        }

        if (event.payload.delta) {
          receivedDelta = true;
          handlers?.onTextDelta?.(event.payload.delta);
        }
      },
    );

    try {
      const response = await invoke<OpenAICompatibleCommandResponse>(
        "request_openai_compatible_completion_stream",
        { payload, requestId },
      );

      return this.mapResponse(response, modelConfig.model);
    } catch (error) {
      if (!receivedDelta) {
        try {
          const fallbackResponse = await invoke<OpenAICompatibleCommandResponse>(
            "request_openai_compatible_completion",
            { payload },
          );

          return this.mapResponse(fallbackResponse, modelConfig.model);
        } catch (fallbackError) {
          const message =
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          throw new Error(message || "调用 OpenAI Compatible 接口失败。");
        }
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message || "调用 OpenAI Compatible 接口失败。");
    } finally {
      unlisten();
    }
  }
}
