import { invoke, isTauri } from "@tauri-apps/api/core";
import { createLogger } from "@/services/logging/logger";
import { toErrorStack } from "@/utils/error";
import type {
  SystemInputConfig,
  SystemInputStatus,
  SystemInputTargetApp,
} from "@/types/systemInput";
import { createDefaultSystemInputStatus } from "@/types/systemInput";

const logger = createLogger({
  source: "system-input",
  category: "external-input",
});

function createUnsupportedStatus(message: string): SystemInputStatus {
  return {
    ...createDefaultSystemInputStatus(),
    platform: "web",
    lastError: message,
  };
}

async function invokeLogged<T>(command: string, payload?: Record<string, unknown>) {
  try {
    const result = await invoke<T>(command, payload);
    await logger.debug("system-input.invoke.success", "系统输入 invoke 成功", {
      source: "tauri",
      detail: {
        command,
      },
      visibility: "debug",
    });
    return result;
  } catch (error) {
    await logger.error("system-input.invoke.failed", "系统输入 invoke 失败", {
      category: "error",
      source: "tauri",
      detail: {
        command,
      },
      errorStack: toErrorStack(error),
    });
    throw error;
  }
}

export async function initializeSystemInputNative(
  config: SystemInputConfig,
): Promise<SystemInputStatus> {
  if (!isTauri()) {
    return createUnsupportedStatus("当前环境不支持系统级快捷输入。");
  }

  return await invokeLogged<SystemInputStatus>("system_input_init", { config });
}

export async function updateSystemInputNativeConfig(
  config: SystemInputConfig,
): Promise<SystemInputStatus> {
  if (!isTauri()) {
    return createUnsupportedStatus("当前环境不支持系统级快捷输入。");
  }

  return await invokeLogged<SystemInputStatus>("system_input_update_config", { config });
}

export async function getSystemInputNativeStatus(): Promise<SystemInputStatus> {
  if (!isTauri()) {
    return createUnsupportedStatus("当前环境不支持系统级快捷输入。");
  }

  return await invokeLogged<SystemInputStatus>("system_input_get_status");
}

export async function captureSystemSelectedText(): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }

  return await invokeLogged<string | null>("system_input_capture_selected_text");
}

export async function readSystemClipboardText(): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }

  return await invokeLogged<string | null>("system_input_read_clipboard_text");
}

export async function pasteSystemInputText(
  text: string,
  targetApp?: SystemInputTargetApp | null,
): Promise<boolean> {
  if (!isTauri()) {
    return false;
  }

  return await invokeLogged<boolean>("system_input_paste_text", { text, targetApp });
}
