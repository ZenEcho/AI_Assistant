import { load } from "@tauri-apps/plugin-store";
import { normalizeHistoryLimit } from "@/constants/app";
import type {
  TokenUsage,
  TranslateResult,
  TranslationHistoryItem,
  TranslationHistoryRequest,
  TranslationHistorySourceImage,
} from "@/types/ai";
import type { AIProviderType } from "@/types/app";
import type { TranslationLanguageResolution } from "@/types/language";
import type { OcrRecognitionResult, OcrTextBlock } from "@/types/ocr";

const STORE_FILE = "translation-history.json";
const HISTORY_KEY = "translation-history";

let storePromise: ReturnType<typeof load> | null = null;

function getStore() {
  storePromise ??= load(STORE_FILE, {
    autoSave: 200,
    defaults: {
      [HISTORY_KEY]: [],
    },
  });

  return storePromise;
}

function sanitizeUsage(value: unknown): TokenUsage | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const usage = value as Record<string, unknown>;

  const normalizeToken = (token: unknown) =>
    typeof token === "number" && Number.isFinite(token) ? Math.max(0, Math.round(token)) : undefined;

  const normalizedUsage: TokenUsage = {
    promptTokens: normalizeToken(usage.promptTokens),
    completionTokens: normalizeToken(usage.completionTokens),
    totalTokens: normalizeToken(usage.totalTokens),
  };

  return Object.values(normalizedUsage).some((item) => typeof item === "number")
    ? normalizedUsage
    : undefined;
}

function sanitizeProvider(value: unknown): AIProviderType {
  return value === "openai-compatible" ? value : "openai-compatible";
}

function sanitizeHistorySourceImage(value: unknown): TranslationHistorySourceImage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const sourceImage = value as Record<string, unknown>;

  if (typeof sourceImage.dataUrl !== "string" || typeof sourceImage.mimeType !== "string") {
    return null;
  }

  return {
    dataUrl: sourceImage.dataUrl,
    mimeType: sourceImage.mimeType,
    name:
      typeof sourceImage.name === "string" && sourceImage.name.trim().length > 0
        ? sourceImage.name
        : undefined,
    width:
      typeof sourceImage.width === "number" && Number.isFinite(sourceImage.width)
        ? sourceImage.width
        : undefined,
    height:
      typeof sourceImage.height === "number" && Number.isFinite(sourceImage.height)
        ? sourceImage.height
        : undefined,
  };
}

function sanitizeOcrTextBlock(value: unknown): OcrTextBlock | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const block = value as Record<string, unknown>;
  const box = Array.isArray(block.box) ? block.box : null;
  const bbox = block.bbox && typeof block.bbox === "object"
    ? (block.bbox as Record<string, unknown>)
    : null;

  if (
    typeof block.id !== "string" ||
    typeof block.order !== "number" ||
    typeof block.sourceText !== "string" ||
    typeof block.score !== "number" ||
    !box ||
    box.length !== 4 ||
    !bbox ||
    typeof bbox.x !== "number" ||
    typeof bbox.y !== "number" ||
    typeof bbox.width !== "number" ||
    typeof bbox.height !== "number"
  ) {
    return null;
  }

  return {
    id: block.id,
    order: block.order,
    sourceText: block.sourceText,
    score: block.score,
    box: box as OcrTextBlock["box"],
    bbox: {
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height,
    },
  };
}

function sanitizeOcrRecognitionResult(value: unknown): OcrRecognitionResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const result = value as Record<string, unknown>;

  if (
    (result.engineId !== "rapidocr" && result.engineId !== "paddleocr") ||
    typeof result.engineVersion !== "string" ||
    typeof result.imageWidth !== "number" ||
    typeof result.imageHeight !== "number" ||
    !Array.isArray(result.blocks)
  ) {
    return null;
  }

  const blocks = result.blocks
    .map(sanitizeOcrTextBlock)
    .filter((block): block is OcrTextBlock => Boolean(block));

  return {
    engineId: result.engineId,
    engineVersion: result.engineVersion,
    imageWidth: result.imageWidth,
    imageHeight: result.imageHeight,
    blocks,
  };
}

function sanitizeTranslationResolution(value: unknown): TranslationLanguageResolution | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const resolution = value as Record<string, unknown>;

  if (
    typeof resolution.requestedSourceLanguage !== "string" ||
    typeof resolution.requestedTargetLanguage !== "string" ||
    typeof resolution.resolvedSourceLanguage !== "string" ||
    typeof resolution.resolvedTargetLanguage !== "string" ||
    typeof resolution.systemLanguage !== "string" ||
    typeof resolution.systemLocale !== "string" ||
    typeof resolution.sourceLanguageCode !== "string" ||
    typeof resolution.targetLanguageCode !== "string" ||
    typeof resolution.usedAutoTarget !== "boolean" ||
    typeof resolution.reason !== "string"
  ) {
    return null;
  }

  const rawDetection =
    resolution.detection && typeof resolution.detection === "object"
      ? (resolution.detection as Record<string, unknown>)
      : null;

  return {
    requestedSourceLanguage: resolution.requestedSourceLanguage,
    requestedTargetLanguage: resolution.requestedTargetLanguage,
    resolvedSourceLanguage: resolution.resolvedSourceLanguage,
    resolvedTargetLanguage: resolution.resolvedTargetLanguage,
    systemLanguage: resolution.systemLanguage,
    systemLocale: resolution.systemLocale,
    sourceLanguageCode:
      resolution.sourceLanguageCode as TranslationLanguageResolution["sourceLanguageCode"],
    targetLanguageCode:
      resolution.targetLanguageCode as TranslationLanguageResolution["targetLanguageCode"],
    usedAutoTarget: resolution.usedAutoTarget,
    reason: resolution.reason as TranslationLanguageResolution["reason"],
    detection: rawDetection
      ? {
          language:
            typeof rawDetection.language === "string"
              ? (rawDetection.language as TranslationLanguageResolution["sourceLanguageCode"])
              : "und",
          confidence:
            typeof rawDetection.confidence === "number" && Number.isFinite(rawDetection.confidence)
              ? rawDetection.confidence
              : 0,
          reliable: Boolean(rawDetection.reliable),
          isMixed: Boolean(rawDetection.isMixed),
          strategy:
            typeof rawDetection.strategy === "string"
              ? (rawDetection.strategy as NonNullable<TranslationLanguageResolution["detection"]>["strategy"])
              : "fallback",
        }
      : null,
  };
}

function sanitizeHistoryRequest(value: unknown): TranslationHistoryRequest | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const request = value as Record<string, unknown>;
  const sourceImage = sanitizeHistorySourceImage(request.sourceImage);
  const hasSourceImage =
    typeof request.hasSourceImage === "boolean" ? request.hasSourceImage : Boolean(sourceImage);

  if (
    typeof request.sourceText !== "string" ||
    typeof request.sourceLanguage !== "string" ||
    typeof request.targetLanguage !== "string"
  ) {
    return null;
  }

  return {
    sourceText: request.sourceText,
    sourceLanguage: request.sourceLanguage,
    targetLanguage: request.targetLanguage,
    resolution: sanitizeTranslationResolution(request.resolution),
    hasSourceImage,
    sourceImageName:
      typeof request.sourceImageName === "string" && request.sourceImageName.trim().length > 0
        ? request.sourceImageName
        : sourceImage?.name,
    sourceImage,
    sourceImageOcr: sanitizeOcrRecognitionResult(request.sourceImageOcr),
  };
}

function sanitizeTranslateResult(value: unknown): TranslateResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const result = value as Record<string, unknown>;

  if (typeof result.text !== "string" || typeof result.model !== "string") {
    return null;
  }

  return {
    mode: result.mode === "image" ? "image" : "text",
    text: result.text,
    model: result.model,
    provider: sanitizeProvider(result.provider),
    usage: sanitizeUsage(result.usage),
    // Do not persist provider raw payloads; history only needs the visible result.
    raw: null,
    imageTranslation:
      result.imageTranslation && typeof result.imageTranslation === "object"
        ? (result.imageTranslation as TranslateResult["imageTranslation"])
        : null,
  };
}

function sanitizeHistoryItem(value: unknown): TranslationHistoryItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;
  const request = sanitizeHistoryRequest(item.request);
  const result = sanitizeTranslateResult(item.result);

  if (
    typeof item.id !== "string" ||
    item.id.trim().length === 0 ||
    typeof item.createdAt !== "string" ||
    item.createdAt.trim().length === 0 ||
    typeof item.modelName !== "string" ||
    item.modelName.trim().length === 0 ||
    !request ||
    !result
  ) {
    return null;
  }

  return {
    id: item.id,
    createdAt: item.createdAt,
    modelId: typeof item.modelId === "string" ? item.modelId : "",
    modelName: item.modelName,
    request,
    result,
  };
}

function normalizeHistoryEntries(
  entries: unknown,
  limit: number,
): TranslationHistoryItem[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map(sanitizeHistoryItem)
    .filter((item): item is TranslationHistoryItem => Boolean(item))
    .slice(0, normalizeHistoryLimit(limit));
}

export async function loadTranslationHistory(limit: number): Promise<TranslationHistoryItem[]> {
  const store = await getStore();
  const entries = await store.get<unknown>(HISTORY_KEY);
  const normalizedEntries = normalizeHistoryEntries(entries, limit);

  await store.set(HISTORY_KEY, normalizedEntries);
  await store.save();

  return normalizedEntries;
}

export async function saveTranslationHistory(
  entries: TranslationHistoryItem[],
  limit: number,
): Promise<void> {
  const store = await getStore();
  const normalizedEntries = normalizeHistoryEntries(entries, limit);

  await store.set(HISTORY_KEY, normalizedEntries);
  await store.save();
}

export async function clearTranslationHistory(): Promise<void> {
  const store = await getStore();
  await store.set(HISTORY_KEY, []);
  await store.save();
}
