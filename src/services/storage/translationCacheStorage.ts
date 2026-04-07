import type { TranslateRequest, TranslateResult } from "@/types/ai";
import { DEFAULT_HISTORY_LIMIT, normalizeHistoryLimit } from "@/constants/app";
import { createLogger } from "@/services/logging/logger";
import { toErrorStack } from "@/utils/error";
import type { AIProviderType, ModelConfig } from "@/types/app";

const CACHE_DB_NAME = "ai-translation-translation-cache";
const CACHE_DB_VERSION = 1;
const CACHE_STORE_NAME = "translations";
const CACHE_LAST_ACCESSED_INDEX = "lastAccessedAt";

interface PersistedTranslateResult {
  mode?: TranslateResult["mode"];
  text: string;
  model: string;
  provider: AIProviderType;
  usage?: TranslateResult["usage"];
  raw: null;
  imageTranslation?: TranslateResult["imageTranslation"];
}

interface TranslationCacheEntry {
  key: string;
  result: PersistedTranslateResult;
  sizeBytes: number;
  createdAt: string;
  lastAccessedAt: string;
}

let databasePromise: Promise<IDBDatabase> | null = null;
let persistenceRequested = false;
const logger = createLogger({
  source: "cache",
  category: "cache",
});

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

async function requestPersistentStorage() {
  if (
    persistenceRequested ||
    typeof navigator === "undefined" ||
    !("storage" in navigator) ||
    typeof navigator.storage.persist !== "function"
  ) {
    return;
  }

  persistenceRequested = true;

  try {
    await navigator.storage.persist();
  } catch (error) {
    await logger.warn("cache.persist.request-failed", "请求持久化缓存存储失败", {
      errorStack: toErrorStack(error),
    });
  }
}

function openDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in the current environment."));
      return;
    }

    const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (database.objectStoreNames.contains(CACHE_STORE_NAME)) {
        return;
      }

      const store = database.createObjectStore(CACHE_STORE_NAME, {
        keyPath: "key",
      });

      store.createIndex(CACHE_LAST_ACCESSED_INDEX, CACHE_LAST_ACCESSED_INDEX);
    };

    request.onsuccess = () => {
      const database = request.result;

      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };

      void requestPersistentStorage();
      resolve(database);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open translation cache database."));
    };
  });

  return databasePromise;
}

function estimateEntrySize(
  entry: Pick<TranslationCacheEntry, "key" | "result" | "createdAt" | "lastAccessedAt">,
): number {
  return new TextEncoder().encode(JSON.stringify(entry)).length + 32;
}

function sanitizeProvider(value: unknown): AIProviderType {
  return value === "openai-compatible" ? value : "openai-compatible";
}

function sanitizeUsage(value: unknown): TranslateResult["usage"] | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const usage = value as Record<string, unknown>;

  const normalizeToken = (token: unknown) =>
    typeof token === "number" && Number.isFinite(token) ? Math.max(0, Math.round(token)) : undefined;

  const normalizedUsage = {
    promptTokens: normalizeToken(usage.promptTokens),
    completionTokens: normalizeToken(usage.completionTokens),
    totalTokens: normalizeToken(usage.totalTokens),
  };

  return Object.values(normalizedUsage).some((item) => typeof item === "number")
    ? normalizedUsage
    : undefined;
}

function sanitizeResult(value: unknown): PersistedTranslateResult | null {
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
    raw: null,
    imageTranslation:
      result.imageTranslation && typeof result.imageTranslation === "object"
        ? (result.imageTranslation as TranslateResult["imageTranslation"])
        : null,
  };
}

function sanitizeEntry(value: unknown): TranslationCacheEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as Record<string, unknown>;
  const result = sanitizeResult(entry.result);

  if (
    typeof entry.key !== "string" ||
    entry.key.trim().length === 0 ||
    typeof entry.createdAt !== "string" ||
    entry.createdAt.trim().length === 0 ||
    typeof entry.lastAccessedAt !== "string" ||
    entry.lastAccessedAt.trim().length === 0 ||
    typeof entry.sizeBytes !== "number" ||
    !Number.isFinite(entry.sizeBytes) ||
    entry.sizeBytes < 0 ||
    !result
  ) {
    return null;
  }

  return {
    key: entry.key,
    result,
    sizeBytes: Math.round(entry.sizeBytes),
    createdAt: entry.createdAt,
    lastAccessedAt: entry.lastAccessedAt,
  };
}

async function sha256Hex(input: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hashBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function buildCacheMaterial(
  modelConfig: ModelConfig,
  request: TranslateRequest,
): Promise<Record<string, unknown>> {
  const sourceImageHash = request.sourceImage ? await sha256Hex(request.sourceImage.dataUrl) : null;
  const sourceImageOcrHash = request.sourceImageOcr
    ? await sha256Hex(JSON.stringify({
        engineId: request.sourceImageOcr.engineId,
        engineVersion: request.sourceImageOcr.engineVersion,
        imageWidth: request.sourceImageOcr.imageWidth,
        imageHeight: request.sourceImageOcr.imageHeight,
        blocks: request.sourceImageOcr.blocks.map((block) => ({
          id: block.id,
          order: block.order,
          sourceText: block.sourceText,
          score: block.score,
          box: block.box,
          bbox: block.bbox,
        })),
      }))
    : null;

  return {
    version: 3,
    model: {
      provider: modelConfig.provider,
      baseUrl: modelConfig.baseUrl,
      model: modelConfig.model,
      systemPrompt: modelConfig.systemPrompt,
    },
    request: {
      sourceText: request.sourceText,
      sourceLanguage: request.sourceLanguage,
      targetLanguage: request.targetLanguage,
      sourceImage: request.sourceImage
        ? {
            mimeType: request.sourceImage.mimeType,
            name: request.sourceImage.name ?? "",
            dataHash: sourceImageHash,
          }
        : null,
      sourceImageOcr: request.sourceImageOcr
        ? {
            engineId: request.sourceImageOcr.engineId,
            engineVersion: request.sourceImageOcr.engineVersion,
            dataHash: sourceImageOcrHash,
          }
        : null,
    },
  };
}

export async function createTranslationCacheKey(
  modelConfig: ModelConfig,
  request: TranslateRequest,
): Promise<string> {
  return await sha256Hex(JSON.stringify(await buildCacheMaterial(modelConfig, request)));
}

async function readAllEntries(): Promise<TranslationCacheEntry[]> {
  const database = await openDatabase();
  const transaction = database.transaction(CACHE_STORE_NAME, "readonly");
  const store = transaction.objectStore(CACHE_STORE_NAME);
  const values = await requestToPromise(store.getAll());
  await transactionToPromise(transaction);

  return values
    .map(sanitizeEntry)
    .filter((entry): entry is TranslationCacheEntry => Boolean(entry));
}

async function readEntry(key: string): Promise<{
  rawValue: unknown;
  entry: TranslationCacheEntry | null;
}> {
  const database = await openDatabase();
  const transaction = database.transaction(CACHE_STORE_NAME, "readonly");
  const store = transaction.objectStore(CACHE_STORE_NAME);
  const rawValue = await requestToPromise(store.get(key));
  await transactionToPromise(transaction);

  return {
    rawValue,
    entry: sanitizeEntry(rawValue),
  };
}

async function putEntry(entry: TranslationCacheEntry) {
  const database = await openDatabase();
  const transaction = database.transaction(CACHE_STORE_NAME, "readwrite");
  const store = transaction.objectStore(CACHE_STORE_NAME);

  store.put(entry);
  await transactionToPromise(transaction);
}

async function deleteEntries(keys: string[]) {
  if (keys.length === 0) {
    return;
  }

  const database = await openDatabase();
  const transaction = database.transaction(CACHE_STORE_NAME, "readwrite");
  const store = transaction.objectStore(CACHE_STORE_NAME);

  keys.forEach((key) => {
    store.delete(key);
  });

  await transactionToPromise(transaction);
}

async function enforceCacheLimit(limit: number) {
  const maxEntries = normalizeHistoryLimit(limit);
  const entries = await readAllEntries();
  const sortedEntries = [...entries].sort((left, right) =>
    left.lastAccessedAt.localeCompare(right.lastAccessedAt),
  );
  const overflowCount = sortedEntries.length - maxEntries;

  if (overflowCount <= 0) {
    return;
  }

  await deleteEntries(sortedEntries.slice(0, overflowCount).map((entry) => entry.key));
}

export async function loadCachedTranslation(
  modelConfig: ModelConfig,
  request: TranslateRequest,
): Promise<TranslateResult | null> {
  const key = await createTranslationCacheKey(modelConfig, request);
  const { rawValue, entry } = await readEntry(key);

  if (!entry) {
    if (rawValue) {
      await deleteEntries([key]);
    }
    return null;
  }

  await putEntry({
    ...entry,
    lastAccessedAt: new Date().toISOString(),
  });

  return {
    ...entry.result,
    raw: null,
  };
}

export async function saveCachedTranslation(
  modelConfig: ModelConfig,
  request: TranslateRequest,
  result: TranslateResult,
  maxEntries = DEFAULT_HISTORY_LIMIT,
): Promise<void> {
  const key = await createTranslationCacheKey(modelConfig, request);
  const { entry: existingEntry } = await readEntry(key);
  const now = new Date().toISOString();
  const persistedResult = sanitizeResult(result);

  if (!persistedResult) {
    return;
  }

  const entry: TranslationCacheEntry = {
    key,
    result: persistedResult,
    sizeBytes: 0,
    createdAt: existingEntry?.createdAt ?? now,
    lastAccessedAt: now,
  };

  entry.sizeBytes = estimateEntrySize({
    key: entry.key,
    result: entry.result,
    createdAt: entry.createdAt,
    lastAccessedAt: entry.lastAccessedAt,
  });

  await putEntry(entry);
  await enforceCacheLimit(maxEntries);
}

export async function trimTranslationCache(limit: number): Promise<void> {
  await enforceCacheLimit(limit);
}

export async function clearTranslationCache(): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(CACHE_STORE_NAME, "readwrite");
  const store = transaction.objectStore(CACHE_STORE_NAME);

  store.clear();
  await transactionToPromise(transaction);
}
