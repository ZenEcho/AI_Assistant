import { load } from "@tauri-apps/plugin-store";
import { createDefaultAppConfig, createDefaultPreferences, createEmptyModelConfig } from "@/constants/app";
import type { AppConfig, ModelConfig } from "@/types/app";

const STORE_FILE = "app-config.json";
const CONFIG_KEY = "app-config";

let storePromise: ReturnType<typeof load> | null = null;

function getStore() {
  storePromise ??= load(STORE_FILE, {
    autoSave: 200,
    defaults: {
      [CONFIG_KEY]: createDefaultAppConfig(),
    },
  });

  return storePromise;
}

function sanitizeModelConfig(model: Partial<ModelConfig>): ModelConfig {
  const fallback = createEmptyModelConfig();

  return {
    ...fallback,
    ...model,
    id: model.id ?? fallback.id,
    name: model.name ?? fallback.name,
    provider: "openai-compatible",
    baseUrl: model.baseUrl ?? fallback.baseUrl,
    apiKey: model.apiKey ?? fallback.apiKey,
    model: model.model ?? fallback.model,
    temperature:
      typeof model.temperature === "number" ? model.temperature : fallback.temperature,
    maxTokens: typeof model.maxTokens === "number" ? model.maxTokens : fallback.maxTokens,
    enabled: typeof model.enabled === "boolean" ? model.enabled : fallback.enabled,
    isDefault: Boolean(model.isDefault),
    systemPrompt: model.systemPrompt ?? fallback.systemPrompt,
    timeoutMs: typeof model.timeoutMs === "number" ? model.timeoutMs : fallback.timeoutMs,
    extraHeaders:
      typeof model.extraHeaders === "object" && model.extraHeaders !== null
        ? Object.fromEntries(
            Object.entries(model.extraHeaders).filter(
              (entry): entry is [string, string] =>
                typeof entry[0] === "string" && typeof entry[1] === "string",
            ),
          )
        : fallback.extraHeaders,
    createdAt: model.createdAt ?? fallback.createdAt,
    updatedAt: model.updatedAt ?? fallback.updatedAt,
  };
}

function normalizeModels(models: Partial<ModelConfig>[] | undefined): ModelConfig[] {
  if (!Array.isArray(models)) {
    return [];
  }

  const normalizedModels = models.map(sanitizeModelConfig);
  const preferredDefault =
    normalizedModels.find((model) => model.isDefault && model.enabled) ??
    normalizedModels.find((model) => model.enabled) ??
    normalizedModels[0];

  return normalizedModels.map((model) => ({
    ...model,
    isDefault: preferredDefault ? model.id === preferredDefault.id : false,
  }));
}

function sanitizeAppConfig(config: Partial<AppConfig> | undefined): AppConfig {
  return {
    preferences: {
      ...createDefaultPreferences(),
      ...(config?.preferences ?? {}),
    },
    models: normalizeModels(config?.models),
  };
}

export async function loadAppConfig(): Promise<AppConfig> {
  const store = await getStore();
  const config = await store.get<AppConfig>(CONFIG_KEY);

  if (!config) {
    const fallback = createDefaultAppConfig();
    await store.set(CONFIG_KEY, fallback);
    await store.save();
    return fallback;
  }

  const normalizedConfig = sanitizeAppConfig(config);
  await store.set(CONFIG_KEY, normalizedConfig);
  await store.save();

  return normalizedConfig;
}

export async function saveAppConfig(config: AppConfig): Promise<void> {
  const store = await getStore();
  const normalizedConfig = sanitizeAppConfig(config);
  await store.set(CONFIG_KEY, normalizedConfig);
  await store.save();
}
