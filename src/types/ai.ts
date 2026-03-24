import type { AIProviderType, ModelConfig } from "@/types/app";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ChatCompletionResult {
  id?: string;
  model?: string;
  content: string;
  usage?: TokenUsage;
  raw: unknown;
}

export interface TranslateRequest {
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface TranslateResult {
  text: string;
  model: string;
  provider: AIProviderType;
  usage?: TokenUsage;
  raw: unknown;
}

export interface TranslationHistoryItem {
  id: string;
  createdAt: string;
  modelName: string;
  request: TranslateRequest;
  result: TranslateResult;
}

export interface OpenAICompatibleCommandPayload {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  extraHeaders?: Record<string, string>;
}

export interface OpenAICompatibleCommandResponse {
  id?: string;
  model?: string;
  content: string;
  usage?: TokenUsage;
  raw: unknown;
}

export interface TranslationContext {
  modelConfig: ModelConfig;
  request: TranslateRequest;
}
