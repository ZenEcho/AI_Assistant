import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppConfigStore } from "@/stores/appConfig";
import { emitLog } from "@/services/logging/logEmitter";
import { generateId } from "@/utils/id";
import { toErrorStack } from "@/utils/error";
import type { AppLogCategory, AppLogLevel, AppLogRecord } from "@/types/log";

function resolveWindowLabel() {
  try {
    return getCurrentWindow().label;
  } catch {
    return "web";
  }
}

function shouldWrite() {
  try {
    return useAppConfigStore().preferences.logging.enabled;
  } catch {
    return true;
  }
}

function normalizeCategory(
  category: string | null | undefined,
  source?: string | null,
): AppLogCategory {
  if (category === "frontend" || category === "desktop" || category === "backend") {
    return category;
  }

  if (source === "tauri" || source === "window-manager" || source === "system-input") {
    return "desktop";
  }

  if (source === "rust") {
    return "backend";
  }

  return "frontend";
}

function inferTag(action: string, source?: string | null) {
  if (source && source.trim().length > 0) {
    return source;
  }

  return action;
}

export interface LoggerContext {
  category?: string | null;
  tag?: string;
  source?: string | null;
  traceId?: string | null;
  windowLabel?: string | null;
}

export interface LogWriteOptions extends Omit<Partial<AppLogRecord>, "category" | "tag" | "source"> {
  category?: string | null;
  tag?: string;
  source?: string | null;
}

export function createTraceId() {
  return generateId();
}

export function createRequestId() {
  return generateId();
}

async function writeErrorLikeLog(
  level: AppLogLevel,
  action: string,
  message: string,
  baseContext: LoggerContext,
  options: LogWriteOptions = {},
) {
  if (!shouldWrite()) {
    return;
  }

  const category = normalizeCategory(
    options.category ?? baseContext.category,
    options.source ?? baseContext.source,
  );
  const source = options.source ?? baseContext.source ?? null;

  await emitLog({
    id: options.id ?? generateId(),
    timestamp: options.timestamp ?? new Date().toISOString(),
    level,
    category,
    tag: options.tag ?? baseContext.tag ?? inferTag(action, source),
    message,
    detail: options.detail,
    stack: options.stack ?? options.errorStack ?? null,
    ingestSeq: options.ingestSeq,

    // Compatibility fields retained for old call sites and Rust bridge normalization.
    source,
    action,
    context: options.context ?? null,
    windowLabel: options.windowLabel ?? baseContext.windowLabel ?? resolveWindowLabel(),
    requestId: options.requestId ?? null,
    traceId: options.traceId ?? baseContext.traceId ?? null,
    relatedEntity: options.relatedEntity ?? null,
    success: options.success ?? null,
    durationMs: options.durationMs ?? null,
    errorCode: options.errorCode ?? null,
    errorStack: options.errorStack ?? options.stack ?? null,
    visibility: options.visibility ?? "user",
  });
}

async function noop() {}

export function createLogger(baseContext: LoggerContext) {
  return {
    trace: (_action: string, _message: string, _options?: LogWriteOptions) => noop(),
    debug: (_action: string, _message: string, _options?: LogWriteOptions) => noop(),
    info: (action: string, message: string, options?: LogWriteOptions) =>
      writeErrorLikeLog("info", action, message, baseContext, options),
    warn: (action: string, message: string, options?: LogWriteOptions) =>
      writeErrorLikeLog("warn", action, message, baseContext, options),
    error: (action: string, message: string, options?: LogWriteOptions) =>
      writeErrorLikeLog("error", action, message, baseContext, options),
    fatal: (action: string, message: string, options?: LogWriteOptions) =>
      writeErrorLikeLog("error", action, message, baseContext, options),
    track: async <T>(
      action: string,
      message: string,
      task: (_requestId: string) => Promise<T>,
      options: LogWriteOptions = {},
    ) => {
      const requestId = options.requestId ?? createRequestId();

      try {
        return await task(requestId);
      } catch (error) {
        await writeErrorLikeLog("error", `${action}.failed`, `${message}失败`, baseContext, {
          ...options,
          requestId,
          success: false,
          stack: toErrorStack(error),
        });
        throw error;
      }
    },
  };
}

export const appLogger = createLogger({
  category: "frontend",
  source: "frontend",
});
