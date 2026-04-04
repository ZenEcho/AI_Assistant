import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppConfigStore } from "@/stores/appConfig";
import { emitLog } from "@/services/logging/logEmitter";
import { appLogLevelOrder } from "@/constants/logging";
import { generateId } from "@/utils/id";
import { toErrorStack } from "@/utils/error";
import type { AppLogCategory, AppLogLevel, AppLogRecord, AppLogSource } from "@/types/log";

function resolveWindowLabel() {
  try {
    return getCurrentWindow().label;
  } catch {
    return "web";
  }
}

function shouldWrite(level: AppLogLevel) {
  try {
    const appConfigStore = useAppConfigStore();
    const preferences = appConfigStore.preferences.logging;

    if (!preferences.enabled) {
      return false;
    }

    const minLevel = preferences.enableVerboseDebug ? "trace" : preferences.minLevel;
    return appLogLevelOrder.indexOf(level) >= appLogLevelOrder.indexOf(minLevel);
  } catch {
    return true;
  }
}

export interface LoggerContext {
  source: AppLogSource;
  category?: AppLogCategory;
  traceId?: string | null;
  windowLabel?: string | null;
}

export interface LogWriteOptions extends Partial<AppLogRecord> {
  category?: AppLogCategory;
  source?: AppLogSource;
}

export function createTraceId() {
  return generateId();
}

export function createRequestId() {
  return generateId();
}

export function createLogger(baseContext: LoggerContext) {
  async function write(
    level: AppLogLevel,
    action: string,
    message: string,
    options: LogWriteOptions = {},
  ) {
    if (!shouldWrite(level)) {
      return;
    }

    await emitLog({
      id: options.id ?? generateId(),
      timestamp: options.timestamp ?? new Date().toISOString(),
      level,
      category: options.category ?? baseContext.category ?? "debug",
      source: options.source ?? baseContext.source,
      action,
      message,
      detail: options.detail,
      context: options.context,
      windowLabel: options.windowLabel ?? baseContext.windowLabel ?? resolveWindowLabel(),
      requestId: options.requestId ?? null,
      traceId: options.traceId ?? baseContext.traceId ?? null,
      relatedEntity: options.relatedEntity ?? null,
      success: options.success ?? null,
      durationMs: options.durationMs ?? null,
      errorCode: options.errorCode ?? null,
      errorStack: options.errorStack ?? null,
      visibility: options.visibility ?? "user",
    });
  }

  async function track<T>(
    action: string,
    message: string,
    task: (requestId: string) => Promise<T>,
    options: LogWriteOptions = {},
  ) {
    const requestId = options.requestId ?? createRequestId();
    const startedAt = performance.now();

    await write("info", `${action}.start`, message, {
      ...options,
      requestId,
    });

    try {
      const result = await task(requestId);

      await write("info", `${action}.success`, `${message}完成`, {
        ...options,
        requestId,
        success: true,
        durationMs: Math.round(performance.now() - startedAt),
      });

      return result;
    } catch (error) {
      await write("error", `${action}.failed`, `${message}失败`, {
        ...options,
        requestId,
        success: false,
        durationMs: Math.round(performance.now() - startedAt),
        errorStack: toErrorStack(error),
        detail: options.detail,
      });
      throw error;
    }
  }

  return {
    trace: (action: string, message: string, options?: LogWriteOptions) =>
      write("trace", action, message, options),
    debug: (action: string, message: string, options?: LogWriteOptions) =>
      write("debug", action, message, options),
    info: (action: string, message: string, options?: LogWriteOptions) =>
      write("info", action, message, options),
    warn: (action: string, message: string, options?: LogWriteOptions) =>
      write("warn", action, message, options),
    error: (action: string, message: string, options?: LogWriteOptions) =>
      write("error", action, message, options),
    fatal: (action: string, message: string, options?: LogWriteOptions) =>
      write("fatal", action, message, options),
    track,
  };
}

export const appLogger = createLogger({
  source: "frontend",
  category: "app",
});
