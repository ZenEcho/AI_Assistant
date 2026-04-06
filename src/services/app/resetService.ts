import { invoke, isTauri } from "@tauri-apps/api/core";

export type ResetRuntimeAction = "exit" | "restart";

export interface ResetSoftwareDataOptions {
  resetAppData: () => Promise<void>;
  clearHistory: () => Promise<void>;
  runtimeAction?: ResetRuntimeAction;
  executeRuntimeAction?: (action: ResetRuntimeAction) => Promise<void>;
}

export function resolveResetRuntimeAction(isDev: boolean): ResetRuntimeAction {
  return isDev ? "exit" : "restart";
}

export async function executeResetRuntimeAction(action: ResetRuntimeAction): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invoke("reset_app_runtime", {
    action,
  });
}

export async function resetSoftwareData({
  resetAppData,
  clearHistory,
  runtimeAction = resolveResetRuntimeAction(import.meta.env.DEV),
  executeRuntimeAction = executeResetRuntimeAction,
}: ResetSoftwareDataOptions): Promise<void> {
  await resetAppData();
  await clearHistory();
  await executeRuntimeAction(runtimeAction);
}
