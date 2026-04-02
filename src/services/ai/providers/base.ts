import type {
  ChatCompletionRequest,
  ChatCompletionResult,
  ChatCompletionStreamHandlers,
} from "@/types/ai";
import type { AIProviderType, ModelConfig } from "@/types/app";

export interface AIProvider {
  readonly type: AIProviderType;
  completeChat(
    modelConfig: ModelConfig,
    request: ChatCompletionRequest,
    handlers?: ChatCompletionStreamHandlers,
  ): Promise<ChatCompletionResult>;
}
