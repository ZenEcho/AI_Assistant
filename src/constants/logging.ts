import type { AppLogCategory, AppLogLevel, AppLogSource } from "@/types/log";

export const APP_LOG_EVENT = "app-log:created";
export const APP_LOG_SYNC_CHANNEL = "ai-assistant:app-log";
export const APP_LOG_VIEWER_LIMIT = 500;
export const APP_LOG_DETAIL_MAX_LENGTH = 4_096;
export const APP_LOG_STACK_MAX_LENGTH = 8_192;
export const APP_LOG_TEXT_PREVIEW_LENGTH = 120;

export const appLogLevelOrder: AppLogLevel[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
];

export const appLogLevelLabels: Record<AppLogLevel, string> = {
  trace: "TRACE",
  debug: "DEBUG",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
  fatal: "FATAL",
};

export const appLogCategoryLabels: Record<AppLogCategory, string> = {
  app: "应用",
  settings: "设置",
  translation: "翻译",
  provider: "Provider",
  cache: "缓存",
  window: "窗口",
  shortcut: "快捷键",
  "external-input": "外部输入",
  network: "网络",
  error: "错误",
  storage: "存储",
  debug: "调试",
};

export const appLogSourceLabels: Record<AppLogSource, string> = {
  frontend: "frontend",
  page: "page",
  store: "store",
  service: "service",
  tauri: "tauri",
  rust: "rust",
  provider: "provider",
  "window-manager": "window-manager",
  cache: "cache",
  "system-input": "system-input",
};
