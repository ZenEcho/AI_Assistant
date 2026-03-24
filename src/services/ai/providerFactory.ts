import type { ModelConfig } from "@/types/app";
import type { AIProvider } from "@/services/ai/providers/base";
import { OpenAICompatibleProvider } from "@/services/ai/providers/openaiCompatibleProvider";

export function createAIProvider(modelConfig: ModelConfig): AIProvider {
  switch (modelConfig.provider) {
    case "openai-compatible":
      return new OpenAICompatibleProvider();
    default:
      throw new Error(`Unsupported provider: ${String(modelConfig.provider)}`);
  }
}
