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
    text: result.text,
    model: result.model,
    provider: sanitizeProvider(result.provider),
    usage: sanitizeUsage(result.usage),
    // Do not persist provider raw payloads; history only needs the visible result.
    raw: null,
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
