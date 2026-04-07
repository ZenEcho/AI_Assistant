import type { AIProviderType, ModelConfig } from "@/types/app";
import type { TranslationLanguageResolution } from "@/types/language";
import type {
  OcrBoundingBox,
  OcrEngineId,
  OcrRecognitionResult,
  OcrTextBlock,
} from "@/types/ocr";

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
    width?: number;
    height?: number;
  } | null;
  sourceImageOcr?: OcrRecognitionResult | null;
}

export interface TranslationHistorySourceImage {
  dataUrl: string;
  mimeType: string;
  name?: string;
  width?: number;
  height?: number;
}

export interface TranslationHistoryRequest {
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
  resolution?: TranslationLanguageResolution | null;
  hasSourceImage: boolean;
  sourceImageName?: string;
  sourceImage?: TranslationHistorySourceImage | null;
  sourceImageOcr?: OcrRecognitionResult | null;
}

export interface ImageTranslationBlockResult {
  blockId: string;
  sourceText: string;
  translatedText: string;
  bbox: OcrBoundingBox;
}

export interface ImageTranslationProgressPayload {
  fullText: string;
  blocks: ImageTranslationBlockResult[];
  render: ImageTranslationRenderResult;
}

export interface ImageTranslationProgressHandlers {
  onTextDelta?: (delta: string) => void;
  onTextProgress?: (payload: ImageTranslationProgressPayload) => void;
}

export interface ImageTranslationRenderResult {
  imageDataUrl: string;
  width: number;
  height: number;
}

export interface ImageTranslationResult {
  ocr: {
    engine: {
      engineId: OcrEngineId;
      engineVersion: string;
    };
    blocks: OcrTextBlock[];
  };
  translation: {
    blocks: ImageTranslationBlockResult[];
    fullText: string;
  };
  render: ImageTranslationRenderResult;
}

export interface TranslateResult {
  mode?: "text" | "image";
  text: string;
  model: string;
  provider: AIProviderType;
  usage?: TokenUsage;
  raw: unknown;
  imageTranslation?: ImageTranslationResult | null;
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
