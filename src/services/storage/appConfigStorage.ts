import { load } from "@tauri-apps/plugin-store";
import {
  createDefaultAppConfig,
  createDefaultLoggingPreferences,
  createDefaultPreferences,
  createDefaultSystemInputConfig,
  createDefaultTranslationPreferences,
  createEmptyModelConfig,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_TRANSLATE_SHORTCUT,
  normalizeHistoryLimit,
} from "@/constants/app";
import type { AppConfig, AppLocale, AppPreferences, CloseBehavior, ModelConfig, ThemeMode } from "@/types/app";
import type { AppLogLevel, LoggingPreferences } from "@/types/log";
import {
  defaultSourceLanguage,
  defaultTargetLanguage,
  isAutoLanguageValue,
  isSupportedManualLanguageValue,
} from "@/constants/languages";
import type {
  SystemInputConfig,
} from "@/types/systemInput";

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

function sanitizeLaunchAtStartup(launchAtStartup: unknown): boolean {
  return typeof launchAtStartup === "boolean"
    ? launchAtStartup
    : createDefaultPreferences().launchAtStartup;
}

function sanitizeTranslationSourceLanguage(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return defaultSourceLanguage;
  }

  return isAutoLanguageValue(value) || isSupportedManualLanguageValue(value)
    ? value.trim()
    : defaultSourceLanguage;
}

function sanitizeTranslationTargetLanguage(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return defaultTargetLanguage;
  }

  return isAutoLanguageValue(value) || isSupportedManualLanguageValue(value)
    ? value.trim()
    : defaultTargetLanguage;
}

function sanitizeTranslationPreferences(
  value: Partial<AppPreferences["translation"]> | undefined,
) {
  const fallback = createDefaultTranslationPreferences();

  return {
    sourceLanguage: sanitizeTranslationSourceLanguage(value?.sourceLanguage ?? fallback.sourceLanguage),
    targetLanguage: sanitizeTranslationTargetLanguage(value?.targetLanguage ?? fallback.targetLanguage),
  };
}

function sanitizeLogLevel(value: unknown, fallback: AppLogLevel): AppLogLevel {
  return value === "trace" ||
    value === "debug" ||
    value === "info" ||
    value === "warn" ||
    value === "error" ||
    value === "fatal"
    ? value
    : fallback;
}

function sanitizeLoggingPreferences(
  value: Partial<LoggingPreferences> | undefined,
): LoggingPreferences {
  const fallback = createDefaultLoggingPreferences();

  const normalizePositiveInt = (input: unknown, defaultValue: number, min: number, max: number) =>
    typeof input === "number" && Number.isFinite(input)
      ? Math.min(max, Math.max(min, Math.round(input)))
      : defaultValue;

  return {
    enabled: sanitizeBoolean(value?.enabled, fallback.enabled),
    minLevel: sanitizeLogLevel(value?.minLevel, fallback.minLevel),
    persistMinLevel: sanitizeLogLevel(value?.persistMinLevel, fallback.persistMinLevel),
    enableVerboseDebug: sanitizeBoolean(value?.enableVerboseDebug, fallback.enableVerboseDebug),
    retainDays: normalizePositiveInt(value?.retainDays, fallback.retainDays, 1, 90),
    maxEntries: normalizePositiveInt(value?.maxEntries, fallback.maxEntries, 200, 100_000),
    maxFileSizeMb: normalizePositiveInt(value?.maxFileSizeMb, fallback.maxFileSizeMb, 1, 200),
    captureFrontendErrors: sanitizeBoolean(
      value?.captureFrontendErrors,
      fallback.captureFrontendErrors,
    ),
    captureConsoleErrors: sanitizeBoolean(
      value?.captureConsoleErrors,
      fallback.captureConsoleErrors,
    ),
    detailedRequestLogging: sanitizeBoolean(
      value?.detailedRequestLogging,
      fallback.detailedRequestLogging,
    ),
  };
}

function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeSystemInputConfig(
  config: Partial<SystemInputConfig> | undefined,
): SystemInputConfig {
  const fallback = createDefaultSystemInputConfig();

  return {
    enabled: sanitizeBoolean(config?.enabled, fallback.enabled),
    translateSelectionShortcut:
      typeof config?.translateSelectionShortcut === "string" &&
      config.translateSelectionShortcut.trim().length > 0
        ? config.translateSelectionShortcut.trim()
        : fallback.translateSelectionShortcut,
    translateClipboardShortcut:
      typeof config?.translateClipboardShortcut === "string" &&
      config.translateClipboardShortcut.trim().length > 0
        ? config.translateClipboardShortcut.trim()
        : fallback.translateClipboardShortcut,
    pasteLastTranslationShortcut:
      typeof config?.pasteLastTranslationShortcut === "string" &&
      config.pasteLastTranslationShortcut.trim().length > 0
        ? config.pasteLastTranslationShortcut.trim()
        : fallback.pasteLastTranslationShortcut,
    toggleEnabledShortcut:
      typeof config?.toggleEnabledShortcut === "string" &&
      config.toggleEnabledShortcut.trim().length > 0
        ? config.toggleEnabledShortcut.trim()
        : fallback.toggleEnabledShortcut,
    targetLanguageSwitchShortcut:
      typeof config?.targetLanguageSwitchShortcut === "string" &&
      config.targetLanguageSwitchShortcut.trim().length > 0
        ? config.targetLanguageSwitchShortcut.trim()
        : fallback.targetLanguageSwitchShortcut,
    sourceLanguage: sanitizeTranslationSourceLanguage(config?.sourceLanguage ?? fallback.sourceLanguage),
  };
}

function sanitizePreferences(preferences: Partial<AppPreferences> | undefined): AppPreferences {
  return {
    themeMode: sanitizeThemeMode(preferences?.themeMode),
    locale: sanitizeLocale(preferences?.locale),
    closeBehavior: sanitizeCloseBehavior(preferences?.closeBehavior),
    launchAtStartup: sanitizeLaunchAtStartup(preferences?.launchAtStartup),
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
    selectedTranslationModelId:
      typeof preferences?.selectedTranslationModelId === "string" &&
      preferences.selectedTranslationModelId.trim().length > 0
        ? preferences.selectedTranslationModelId.trim()
        : null,
    translation: sanitizeTranslationPreferences(preferences?.translation),
    systemInput: sanitizeSystemInputConfig(preferences?.systemInput),
    logging: sanitizeLoggingPreferences(preferences?.logging),
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
