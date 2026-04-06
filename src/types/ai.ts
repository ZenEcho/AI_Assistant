import type { AIProviderType, ModelConfig } from "@/types/app";
import type { TranslationLanguageResolution } from "@/types/language";

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
  role: "system" | "user" | "translation";
  content: ChatMessageContent;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  requestId?: string;
  traceId?: string;
  detailedLogging?: boolean;
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
  resolution?: TranslationLanguageResolution | null;
  sourceImage?: {
    dataUrl: string;
    mimeType: string;
    name?: string;
  } | null;
}

export interface TranslationHistorySourceImage {
  dataUrl: string;
  mimeType: string;
  name?: string;
}

export interface TranslationHistoryRequest {
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
  resolution?: TranslationLanguageResolution | null;
  hasSourceImage: boolean;
  sourceImageName?: string;
  sourceImage?: TranslationHistorySourceImage | null;
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
  modelId: string;
  modelName: string;
  request: TranslationHistoryRequest;
  result: TranslateResult;
}

export interface OpenAICompatibleCommandPayload {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  timeoutMs?: number;
  requestId?: string;
  traceId?: string;
  detailedLogging?: boolean;
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

export interface TranslationResultPresentPayload {
  request?: TranslateRequest | null;
  result: TranslateResult;
  modelName: string;
}
