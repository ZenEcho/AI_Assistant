import type { SelectOption } from "naive-ui";
import type {
  AppConfig,
  CloseBehavior,
  AppLocale,
  AppPreferences,
  ModelConfig,
  ModelConfigDraft,
  ThemeMode,
} from "@/types/app";

export const DEFAULT_THEME_COLOR = "#3b82f6";
export const DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_MODEL_NAME = "gpt-4o-mini";
export const DEFAULT_HISTORY_LIMIT = 200;
export const MAX_HISTORY_LIMIT = 9999;
export const DEFAULT_GLOBAL_SHORTCUT = "Alt+Space";
export const DEFAULT_TRANSLATE_SHORTCUT = "Ctrl+Enter";

export const DEFAULT_TRANSLATION_SYSTEM_PROMPT =
  "You are a professional translation engine. Translate accurately, keep the original tone, preserve structure and line breaks, and return only the translated text.";

export const themeModeOptions: Array<SelectOption & { value: ThemeMode }> = [
  { label: "跟随系统", value: "auto" },
  { label: "浅色", value: "light" },
  { label: "深色", value: "dark" },
];

export const localeOptions: Array<SelectOption & { value: AppLocale }> = [
  { label: "简体中文", value: "zh-CN" },
  { label: "English", value: "en-US" },
];

export const closeBehaviorOptions: Array<
  SelectOption & {
    value: CloseBehavior;
    description: string;
  }
> = [
  {
    label: "每次询问",
    value: "ask",
    description: "点击关闭时弹出确认框，由你决定是隐藏到托盘还是直接退出。",
  },
  {
    label: "隐藏到托盘",
    value: "hide-to-tray",
    description: "点击关闭后不退出应用，窗口会隐藏到系统托盘，后台继续运行。",
  },
  {
    label: "直接退出",
    value: "close",
    description: "点击关闭后直接退出应用，不再弹出确认框。",
  },
];

export const presetThemeColors = [
  "#3b82f6",
  "#0ea5e9",
  "#10b981",
  "#22c55e",
  "#f97316",
  "#ef4444",
  "#eab308",
  "#8b5cf6",
];

export function normalizeHistoryLimit(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_HISTORY_LIMIT;
  }

  return Math.min(MAX_HISTORY_LIMIT, Math.max(1, Math.round(value)));
}

export function createDefaultPreferences(): AppPreferences {
  return {
    themeMode: "auto",
    themeColor: DEFAULT_THEME_COLOR,
    locale: "zh-CN",
    closeBehavior: "ask",
    historyLimit: DEFAULT_HISTORY_LIMIT,
    globalShortcut: DEFAULT_GLOBAL_SHORTCUT,
    translateShortcut: DEFAULT_TRANSLATE_SHORTCUT,
  };
}

export function createEmptyModelConfig(): ModelConfig {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    name: "",
    provider: "openai-compatible",
    baseUrl: DEFAULT_BASE_URL,
    apiKey: "",
    model: DEFAULT_MODEL_NAME,
    enabled: true,
    isDefault: false,
    systemPrompt: DEFAULT_TRANSLATION_SYSTEM_PROMPT,
    timeoutMs: 60_000,
    createdAt: now,
    updatedAt: now,
  };
}

export function createMockModelConfigs(): ModelConfig[] {
  const now = new Date().toISOString();

  return [
    {
      id: "preset-openai-official",
      name: "OpenAI 官方示例",
      provider: "openai-compatible",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-4o-mini",
      enabled: false,
      isDefault: false,
      systemPrompt: DEFAULT_TRANSLATION_SYSTEM_PROMPT,
      timeoutMs: 60_000,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "preset-openrouter",
      name: "OpenRouter 示例",
      provider: "openai-compatible",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "",
      model: "openai/gpt-4o-mini",
      enabled: false,
      isDefault: false,
      systemPrompt: DEFAULT_TRANSLATION_SYSTEM_PROMPT,
      timeoutMs: 60_000,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "preset-siliconflow",
      name: "硅基流动示例",
      provider: "openai-compatible",
      baseUrl: "https://api.siliconflow.cn/v1",
      apiKey: "",
      model: "Qwen/Qwen2.5-7B-Instruct",
      enabled: false,
      isDefault: false,
      systemPrompt: DEFAULT_TRANSLATION_SYSTEM_PROMPT,
      timeoutMs: 60_000,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "preset-lm-studio-local",
      name: "LM Studio 本地示例",
      provider: "openai-compatible",
      baseUrl: "http://127.0.0.1:1234/v1",
      apiKey: "lm-studio",
      model: "qwen2.5-7b-instruct",
      enabled: false,
      isDefault: false,
      systemPrompt: DEFAULT_TRANSLATION_SYSTEM_PROMPT,
      timeoutMs: 60_000,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function createDefaultAppConfig(): AppConfig {
  return {
    preferences: createDefaultPreferences(),
    models: createMockModelConfigs(),
  };
}

export function createModelConfigDraft(model?: ModelConfig): ModelConfigDraft {
  const source = model ?? createEmptyModelConfig();

  return {
    id: model?.id,
    name: source.name,
    baseUrl: source.baseUrl,
    apiKey: source.apiKey,
    model: source.model,
    enabled: source.enabled,
    isDefault: source.isDefault,
    systemPrompt: source.systemPrompt,
    timeoutMs: source.timeoutMs,
  };
}
