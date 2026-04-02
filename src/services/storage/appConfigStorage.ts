import { load } from "@tauri-apps/plugin-store";
import {
  createDefaultAppConfig,
  createDefaultPreferences,
  createEmptyModelConfig,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_TRANSLATE_SHORTCUT,
  normalizeHistoryLimit,
} from "@/constants/app";
import type { AppConfig, AppLocale, AppPreferences, CloseBehavior, ModelConfig, ThemeMode } from "@/types/app";

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
    enabled: typeof model.enabled === "boolean" ? model.enabled : fallback.enabled,
    isDefault: Boolean(model.isDefault),
    systemPrompt: model.systemPrompt ?? fallback.systemPrompt,
    timeoutMs: typeof model.timeoutMs === "number" ? model.timeoutMs : fallback.timeoutMs,
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

function sanitizeThemeMode(themeMode: unknown): ThemeMode {
  return themeMode === "light" || themeMode === "dark" || themeMode === "auto"
    ? themeMode
    : createDefaultPreferences().themeMode;
}

function sanitizeLocale(locale: unknown): AppLocale {
  return locale === "zh-CN" || locale === "en-US" ? locale : createDefaultPreferences().locale;
}

function sanitizeCloseBehavior(closeBehavior: unknown): CloseBehavior {
  return closeBehavior === "ask" || closeBehavior === "hide-to-tray" || closeBehavior === "close"
    ? closeBehavior
    : createDefaultPreferences().closeBehavior;
}

function sanitizePreferences(preferences: Partial<AppPreferences> | undefined): AppPreferences {
  const defaults = createDefaultPreferences();

  return {
    themeMode: sanitizeThemeMode(preferences?.themeMode),
    themeColor:
      typeof preferences?.themeColor === "string" && preferences.themeColor.trim().length > 0
        ? preferences.themeColor
        : defaults.themeColor,
    locale: sanitizeLocale(preferences?.locale),
    closeBehavior: sanitizeCloseBehavior(preferences?.closeBehavior),
    historyLimit: normalizeHistoryLimit(preferences?.historyLimit),
    globalShortcut:
      typeof preferences?.globalShortcut === "string" && preferences.globalShortcut.trim().length > 0
        ? preferences.globalShortcut
        : DEFAULT_GLOBAL_SHORTCUT,
    translateShortcut:
      typeof preferences?.translateShortcut === "string" &&
      preferences.translateShortcut.trim().length > 0
        ? preferences.translateShortcut
        : DEFAULT_TRANSLATE_SHORTCUT,
  };
}

function sanitizeAppConfig(config: Partial<AppConfig> | undefined): AppConfig {
  return {
    preferences: sanitizePreferences(config?.preferences),
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
