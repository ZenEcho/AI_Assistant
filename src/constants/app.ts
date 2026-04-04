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
import type { TranslationPreferences } from "@/types/language";
import type { AppLogLevel, LoggingPreferences } from "@/types/log";
import type {
  SystemInputCaptureMode,
  SystemInputConfig,
  SystemInputTriggerMode,
  SystemInputWritebackMode,
} from "@/types/systemInput";
import { defaultSourceLanguage, defaultTargetLanguage } from "@/constants/languages";

export const DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_MODEL_NAME = "gpt-4o-mini";
export const DEFAULT_HISTORY_LIMIT = 9999;
export const MAX_HISTORY_LIMIT = 9999;
export const DEFAULT_GLOBAL_SHORTCUT = "Alt+Space";
export const DEFAULT_TRANSLATE_SHORTCUT = "Ctrl+Enter";
export const DEFAULT_LOG_MIN_LEVEL: AppLogLevel = "info";
export const DEFAULT_LOG_PERSIST_MIN_LEVEL: AppLogLevel = "info";
export const DEFAULT_LOG_RETAIN_DAYS = 7;
export const DEFAULT_LOG_MAX_ENTRIES = 20_000;
export const DEFAULT_LOG_MAX_FILE_SIZE_MB = 20;
export const SYSTEM_INPUT_TARGET_LANGUAGE_SWITCH_SHORTCUT = "Ctrl+`";
export const SYSTEM_INPUT_TARGET_LANGUAGE_SWITCH_SHORTCUT_LABEL = "Ctrl+~";
export const DEFAULT_SYSTEM_INPUT_DOUBLE_TAP_INTERVAL = 280;
export const DEFAULT_SYSTEM_INPUT_SOURCE_LANGUAGE = "auto";
export const DEFAULT_SYSTEM_INPUT_TARGET_LANGUAGE = "Chinese (Simplified)";
export const DEFAULT_SYSTEM_INPUT_TRIGGER_MODE: SystemInputTriggerMode = "double-space";
export const DEFAULT_SYSTEM_INPUT_CAPTURE_MODE: SystemInputCaptureMode = "before-caret-first";
export const DEFAULT_SYSTEM_INPUT_WRITEBACK_MODE: SystemInputWritebackMode = "auto";
export const SYSTEM_INPUT_ACTION_SHORTCUTS = Object.freeze({
  translateSelection: "Ctrl+1",
  translateClipboard: "Ctrl+2",
  pasteLastTranslation: "Ctrl+3",
  toggleEnabled: "Ctrl+4",
});
export const SYSTEM_INPUT_ACTION_SHORTCUT_HINT =
  "下面四个系统输入增强快捷键都可以单独修改。";
export const DEFAULT_SYSTEM_INPUT_REPLACE_SELECTION_ON_SHORTCUT_TRANSLATE = true;

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

export const systemInputTriggerModeOptions: Array<
  SelectOption & {
    value: SystemInputTriggerMode;
    description: string;
  }
> = [
  {
    label: "双空格",
    value: "double-space",
    description: "更接近沉浸式翻译，但必须依赖原生层监听普通输入字符。",
  },
  {
    label: "双 Alt",
    value: "double-alt",
    description: "更稳，适合作为首发期的系统级触发方式。",
  },
  {
    label: "手动热键",
    value: "manual-hotkey",
    description: "保留显式触发模式，减少误触发。",
  },
];

export const systemInputCaptureModeOptions: Array<
  SelectOption & {
    value: SystemInputCaptureMode;
    description: string;
  }
> = [
  {
    label: "光标前优先",
    value: "before-caret-first",
    description: "更贴近双空格交互，但对原生能力要求最高。",
  },
  {
    label: "选中文本优先",
    value: "selection-first",
    description: "最稳，适合作为保底模式。",
  },
  {
    label: "整段输入优先",
    value: "whole-input-first",
    description: "适合普通输入框，不适合复杂编辑器。",
  },
];

export const systemInputWritebackModeOptions: Array<
  SelectOption & {
    value: SystemInputWritebackMode;
    description: string;
  }
> = [
  {
    label: "自动",
    value: "auto",
    description: "原生替换、模拟输入、剪贴板之间自动回退。",
  },
  {
    label: "原生替换",
    value: "native-replace",
    description: "优先调用原生可编辑控件接口。",
  },
  {
    label: "模拟输入",
    value: "simulate-input",
    description: "删除原文后重新输入译文。",
  },
  {
    label: "剪贴板粘贴",
    value: "clipboard-paste",
    description: "高兼容回退方式。",
  },
  {
    label: "仅结果窗",
    value: "popup-only",
    description: "不自动替换，只展示结果。",
  },
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
    locale: "zh-CN",
    closeBehavior: "ask",
    launchAtStartup: false,
    historyLimit: DEFAULT_HISTORY_LIMIT,
    globalShortcut: DEFAULT_GLOBAL_SHORTCUT,
    translateShortcut: DEFAULT_TRANSLATE_SHORTCUT,
    selectedTranslationModelId: null,
    translation: createDefaultTranslationPreferences(),
    systemInput: createDefaultSystemInputConfig(),
    logging: createDefaultLoggingPreferences(),
  };
}

export function createDefaultLoggingPreferences(): LoggingPreferences {
  return {
    enabled: true,
    minLevel: DEFAULT_LOG_MIN_LEVEL,
    persistMinLevel: DEFAULT_LOG_PERSIST_MIN_LEVEL,
    enableVerboseDebug: false,
    retainDays: DEFAULT_LOG_RETAIN_DAYS,
    maxEntries: DEFAULT_LOG_MAX_ENTRIES,
    maxFileSizeMb: DEFAULT_LOG_MAX_FILE_SIZE_MB,
    captureFrontendErrors: true,
    captureConsoleErrors: true,
    detailedRequestLogging: false,
  };
}

export function createDefaultTranslationPreferences(): TranslationPreferences {
  return {
    sourceLanguage: defaultSourceLanguage,
    targetLanguage: defaultTargetLanguage,
  };
}

export function createDefaultSystemInputConfig(): SystemInputConfig {
  return {
    enabled: false,
    triggerMode: DEFAULT_SYSTEM_INPUT_TRIGGER_MODE,
    doubleTapIntervalMs: DEFAULT_SYSTEM_INPUT_DOUBLE_TAP_INTERVAL,
    translateSelectionShortcut: SYSTEM_INPUT_ACTION_SHORTCUTS.translateSelection,
    translateClipboardShortcut: SYSTEM_INPUT_ACTION_SHORTCUTS.translateClipboard,
    pasteLastTranslationShortcut: SYSTEM_INPUT_ACTION_SHORTCUTS.pasteLastTranslation,
    toggleEnabledShortcut: SYSTEM_INPUT_ACTION_SHORTCUTS.toggleEnabled,
    appBlacklist: [],
    appWhitelist: [],
    sourceLanguage: DEFAULT_SYSTEM_INPUT_SOURCE_LANGUAGE,
    targetLanguage: DEFAULT_SYSTEM_INPUT_TARGET_LANGUAGE,
    onlySelectedText: false,
    autoReplace: true,
    replaceSelectionOnShortcutTranslate:
      DEFAULT_SYSTEM_INPUT_REPLACE_SELECTION_ON_SHORTCUT_TRANSLATE,
    enableClipboardFallback: true,
    showFloatingHint: true,
    onlyWhenEnglishText: true,
    excludeCodeEditors: true,
    debugLogging: false,
    captureMode: DEFAULT_SYSTEM_INPUT_CAPTURE_MODE,
    writebackMode: DEFAULT_SYSTEM_INPUT_WRITEBACK_MODE,
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
