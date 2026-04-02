import type { AIProviderType, ModelConfig } from "@/types/app";

export interface ChatMessageTextContentPart {
  type: "text";
  text: string;
}

export interface ChatMessageImageContentPart {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}

export type ChatMessageContentPart = ChatMessageTextContentPart | ChatMessageImageContentPart;
export type ChatMessageContent = string | ChatMessageContentPart[];

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: ChatMessageContent;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatCompletionStreamHandlers {
  onTextDelta?: (delta: string) => void;
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
  sourceImage?: {
    dataUrl: string;
    mimeType: string;
    name?: string;
  } | null;
}

export interface TranslationHistoryRequest {
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
  hasSourceImage: boolean;
  sourceImageName?: string;
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
  request: TranslationHistoryRequest;
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

export interface OpenAICompatibleStreamEventPayload {
  requestId: string;
  delta: string;
}

export interface TranslationContext {
  modelConfig: ModelConfig;
  request: TranslateRequest;
}

export interface TranslationWindowRunPayload {
  request: TranslateRequest;
  modelId: string;
}
