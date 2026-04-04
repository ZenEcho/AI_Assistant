import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { APP_LOG_EVENT } from "@/constants/logging";
import { listenFallbackLogSync } from "@/services/logging/logEmitter";
import { useLogCenterStore } from "@/stores/logCenter";
import type { AppLogRecord } from "@/types/log";

let stopBridge: (() => void) | null = null;

export async function startLogBridge() {
  if (stopBridge) {
    return stopBridge;
  }

  const logStore = useLogCenterStore();
  const disposers: Array<() => void> = [];

  if (isTauri()) {
    const unlisten = await listen<AppLogRecord>(APP_LOG_EVENT, (event) => {
      logStore.append(event.payload);
    });
    disposers.push(unlisten);
  }

  disposers.push(
    listenFallbackLogSync((record) => {
      logStore.append(record);
    }),
  );

  stopBridge = () => {
    disposers.forEach((dispose) => dispose());
    stopBridge = null;
  };

  return stopBridge;
}
