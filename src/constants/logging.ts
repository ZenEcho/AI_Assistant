import type { AppLogCategory, AppLogLevel } from "@/types/log";

export const APP_LOG_EVENT = "app-log:created";
export const APP_LOG_SYNC_CHANNEL = "ai-translation:app-log";
export const APP_LOG_VIEWER_LIMIT = 500;
export const APP_LOG_DETAIL_MAX_LENGTH = 4_096;
export const APP_LOG_STACK_MAX_LENGTH = 8_192;
export const APP_LOG_TEXT_PREVIEW_LENGTH = 120;

export const appLogCategoryLabels: Record<AppLogCategory, string> = {
  frontend: "前端",
  desktop: "桌面",
  backend: "后端",
};

export const appLogLevelLabels: Record<AppLogLevel, string> = {
  info: "信息",
  warn: "警告",
  error: "错误",
};
