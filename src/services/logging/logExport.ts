import { exportAppLogs } from "@/services/logging/logStorage";
import type { AppLogExportOptions } from "@/types/log";

export async function exportLogs(options: AppLogExportOptions) {
  return await exportAppLogs(options);
}
