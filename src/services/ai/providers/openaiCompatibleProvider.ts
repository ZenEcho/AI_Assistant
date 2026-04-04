import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createLogger, createTraceId } from "@/services/logging/logger";
import { summarizeTranslationText } from "@/services/logging/logSanitizer";
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

const logger = createLogger({
  source: "provider",
  category: "provider",
});

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
      requestId: request.requestId,
      traceId: request.traceId,
      detailedLogging: request.detailedLogging,
    };
    const requestId = request.requestId ?? crypto.randomUUID();
    const traceId = request.traceId ?? createTraceId();
    let receivedDelta = false;
    const requiresStreaming = typeof handlers?.onTextDelta === "function";
    const requestSummary = {
      provider: modelConfig.provider,
      model: modelConfig.model,
      baseUrl: modelConfig.baseUrl,
      timeoutMs: modelConfig.timeoutMs,
      stream: requiresStreaming,
      messageCount: request.messages.length,
      messages: request.detailedLogging
        ? request.messages.map((message) => ({
            role: message.role,
            content:
              typeof message.content === "string"
                ? summarizeTranslationText(message.content)
                : message.content.map((part) =>
                    part.type === "text"
                      ? {
                          type: part.type,
                          text: summarizeTranslationText(part.text),
                        }
                      : {
                          type: part.type,
                          image_url: {
                            detail: part.image_url.detail,
                          },
                        }),
          }))
        : undefined,
    };
    await logger.info("provider.request.start", "Provider 请求开始", {
      category: "network",
      requestId,
      traceId,
      detail: requestSummary,
    });
    const unlisten = await listen<OpenAICompatibleStreamEventPayload>(
      "openai-compatible-stream",
      (event) => {
        if (event.payload.requestId !== requestId) {
          return;
        }

        if (event.payload.delta) {
          receivedDelta = true;
          void logger.debug("provider.stream.delta", "收到流式响应分片", {
            category: "network",
            requestId,
            traceId,
            visibility: "debug",
            detail: {
              deltaLength: event.payload.delta.length,
            },
          });
          handlers?.onTextDelta?.(event.payload.delta);
        }
      },
    );

    try {
      const response = await invoke<OpenAICompatibleCommandResponse>(
        "request_openai_compatible_completion_stream",
        { payload, requestId },
      );
      await logger.info("provider.request.success", "Provider 请求成功", {
        category: "network",
        requestId,
        traceId,
        success: true,
        detail: {
          providerResponseId: response.id,
          model: response.model ?? modelConfig.model,
          hasUsage: Boolean(response.usage),
        },
      });

      return this.mapResponse(response, modelConfig.model);
    } catch (error) {
      if (!receivedDelta && !requiresStreaming) {
        try {
          const fallbackResponse = await invoke<OpenAICompatibleCommandResponse>(
            "request_openai_compatible_completion",
            { payload },
          );
          await logger.warn("provider.request.stream-fallback", "流式请求失败，已回退到非流式调用", {
            category: "network",
            requestId,
            traceId,
            detail: {
              reason: error instanceof Error ? error.message : String(error),
            },
          });

          return this.mapResponse(fallbackResponse, modelConfig.model);
        } catch (fallbackError) {
          const message =
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          await logger.error("provider.request.failed", "Provider 请求失败", {
            category: "network",
            requestId,
            traceId,
            success: false,
            errorStack:
              fallbackError instanceof Error ? fallbackError.stack : String(fallbackError),
          });
          throw new Error(message || "调用 OpenAI Compatible 接口失败。");
        }
      }

      const message = error instanceof Error ? error.message : String(error);
      await logger.error("provider.request.failed", "Provider 请求失败", {
        category: "network",
        requestId,
        traceId,
        success: false,
        errorStack: error instanceof Error ? error.stack : String(error),
      });
      if (!receivedDelta && requiresStreaming) {
        throw new Error(
          message
            ? `流式翻译失败，未收到任何增量内容。请确认当前接口支持 stream/SSE。原始错误：${message}`
            : "流式翻译失败，未收到任何增量内容。请确认当前接口支持 stream/SSE。",
        );
      }

      throw new Error(message || "调用 OpenAI Compatible 接口失败。");
    } finally {
      unlisten();
    }
  }
}
