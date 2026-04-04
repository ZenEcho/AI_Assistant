import { invoke, isTauri } from "@tauri-apps/api/core";
import type { LoggingPreferences } from "@/types/log";
import type { AppLogExportOptions, AppLogExportResult, AppLogQuery, AppLogRecord } from "@/types/log";

export async function appendAppLog(record: AppLogRecord): Promise<AppLogRecord> {
  if (!isTauri()) {
    return record;
  }

  return await invoke<AppLogRecord>("app_log_append", {
    payload: record,
  });
}

export async function queryAppLogs(query: AppLogQuery): Promise<AppLogRecord[]> {
  if (!isTauri()) {
    return [];
  }

  return await invoke<AppLogRecord[]>("app_log_query", {
    query,
  });
}

export async function clearAppLogs(): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invoke("app_log_clear");
}

export async function exportAppLogs(options: AppLogExportOptions): Promise<AppLogExportResult> {
  if (!isTauri()) {
    throw new Error("当前环境不支持日志导出。");
  }

  return await invoke<AppLogExportResult>("app_log_export", {
    options,
  });
}

export async function updateAppLogRuntimeConfig(
  preferences: LoggingPreferences,
): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invoke("app_log_update_config", {
    payload: {
      retainDays: preferences.retainDays,
      maxEntries: preferences.maxEntries,
      maxFileSizeMb: preferences.maxFileSizeMb,
    },
  });
}
