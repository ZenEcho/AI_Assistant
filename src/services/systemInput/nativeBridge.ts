import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { createLogger } from "@/services/logging/logger";
import type {
  SystemInputCancelSessionPayload,
  SystemInputInitPayload,
  SystemInputSelectionCaptureResult,
  SystemInputStatus,
  SystemInputTargetApp,
  SystemInputTranslationRequestEvent,
  SystemInputTranslationSubmitPayload,
  SystemInputWritebackResult,
} from "@/types/systemInput";
import { createDefaultSystemInputStatus } from "@/types/systemInput";

export const SYSTEM_INPUT_STATUS_EVENT = "system-input:status";
export const SYSTEM_INPUT_TRANSLATION_REQUEST_EVENT = "system-input:translation-request";
export const SYSTEM_INPUT_WRITEBACK_RESULT_EVENT = "system-input:writeback-result";
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
      errorStack: error instanceof Error ? error.stack : String(error),
    });
    throw error;
  }
}

export async function initializeSystemInputNative(
  payload: SystemInputInitPayload,
): Promise<SystemInputStatus> {
  if (!isTauri()) {
    return createUnsupportedStatus("当前环境不支持系统级输入增强。");
  }

  return await invokeLogged<SystemInputStatus>("system_input_init", { payload });
}

export async function updateSystemInputNativeConfig(
  config: SystemInputInitPayload["config"],
): Promise<SystemInputStatus> {
  if (!isTauri()) {
    return createUnsupportedStatus("当前环境不支持系统级输入增强。");
  }

  return await invokeLogged<SystemInputStatus>("system_input_update_config", { config });
}

export async function getSystemInputNativeStatus(): Promise<SystemInputStatus> {
  if (!isTauri()) {
    return createUnsupportedStatus("当前环境不支持系统级输入增强。");
  }

  return await invokeLogged<SystemInputStatus>("system_input_get_status");
}

export async function captureSystemSelectedText(): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }

  return await invokeLogged<string | null>("system_input_capture_selected_text");
}

export async function captureSystemSelectedTextWithContext(): Promise<SystemInputSelectionCaptureResult | null> {
  if (!isTauri()) {
    return null;
  }

  return await invokeLogged<SystemInputSelectionCaptureResult | null>(
    "system_input_capture_selected_text_with_context",
  );
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

export async function submitSystemInputTranslation(
  payload: SystemInputTranslationSubmitPayload,
): Promise<SystemInputWritebackResult> {
  if (!isTauri()) {
    return {
      sessionId: payload.sessionId,
      success: false,
      usedStrategy: "popup-only",
      fallbackWindowRequired: true,
      error: "当前环境不支持系统级输入增强。",
    };
  }

  return await invokeLogged<SystemInputWritebackResult>("system_input_submit_translation", { payload });
}

export async function cancelSystemInputSession(
  payload: SystemInputCancelSessionPayload,
): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invokeLogged("system_input_cancel_session", { payload });
}

export async function listenSystemInputStatus(
  handler: (payload: SystemInputStatus) => void,
): Promise<UnlistenFn> {
  return await listen<SystemInputStatus>(SYSTEM_INPUT_STATUS_EVENT, (event) => {
    handler(event.payload);
  });
}

export async function listenSystemInputTranslationRequest(
  handler: (payload: SystemInputTranslationRequestEvent) => void,
): Promise<UnlistenFn> {
  return await listen<SystemInputTranslationRequestEvent>(
    SYSTEM_INPUT_TRANSLATION_REQUEST_EVENT,
    (event) => {
      handler(event.payload);
    },
  );
}

export async function listenSystemInputWritebackResult(
  handler: (payload: SystemInputWritebackResult) => void,
): Promise<UnlistenFn> {
  return await listen<SystemInputWritebackResult>(SYSTEM_INPUT_WRITEBACK_RESULT_EVENT, (event) => {
    handler(event.payload);
  });
}
