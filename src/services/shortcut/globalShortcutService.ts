import {
  register,
  unregister,
  unregisterAll,
} from "@tauri-apps/plugin-global-shortcut";
import { createLogger } from "@/services/logging/logger";
import { toggleTranslationWindowVisibility } from "@/services/window/windowManager";

export interface ShortcutRegistrationResult {
  success: boolean;
  conflict: boolean;
  error?: string;
}

type ShortcutHandler = () => void | Promise<void>;

const MAIN_WINDOW_SHORTCUT_ID = "main-window";
const registeredShortcuts = new Map<string, string>();
const logger = createLogger({
  source: "service",
  category: "shortcut",
});

function isShortcutConflict(message: string) {
  const normalized = message.toLowerCase();

  return normalized.includes("already registered") ||
    normalized.includes("occupied") ||
    normalized.includes("hotkey") ||
    normalized.includes("accelerator");
}

export async function registerNamedShortcut(
  id: string,
  shortcut: string,
  handler: ShortcutHandler,
): Promise<ShortcutRegistrationResult> {
  const previousShortcut = registeredShortcuts.get(id);

  if (previousShortcut) {
    try {
      await unregister(previousShortcut);
    } catch {
      // Ignore errors when unregistering an old shortcut.
    }
    registeredShortcuts.delete(id);
  }

  try {
    await register(shortcut, (event) => {
      if (event.state === "Pressed") {
        void logger.info("shortcut.trigger", "快捷键已触发", {
          detail: {
            id,
            shortcut,
          },
        });
        void handler();
      }
    });

    registeredShortcuts.set(id, shortcut);
    await logger.info("shortcut.register", "快捷键注册成功", {
      detail: {
        id,
        shortcut,
      },
      success: true,
    });
    return { success: true, conflict: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logger.warn("shortcut.register.failed", "快捷键注册失败", {
      detail: {
        id,
        shortcut,
        conflict: isShortcutConflict(message),
      },
      errorStack: error instanceof Error ? error.stack : String(error),
      success: false,
    });

    return {
      success: false,
      conflict: isShortcutConflict(message),
      error: `注册快捷键失败：${message}`,
    };
  }
}

export async function registerGlobalShortcut(
  shortcut: string,
): Promise<ShortcutRegistrationResult> {
  return await registerNamedShortcut(MAIN_WINDOW_SHORTCUT_ID, shortcut, () =>
    toggleTranslationWindowVisibility(),
  );
}

export async function unregisterGlobalShortcut(): Promise<void> {
  const currentShortcut = registeredShortcuts.get(MAIN_WINDOW_SHORTCUT_ID);

  if (currentShortcut) {
    try {
      await unregister(currentShortcut);
    } catch {
      // Ignore
    }
    registeredShortcuts.delete(MAIN_WINDOW_SHORTCUT_ID);
  }
}

export async function unregisterAllShortcuts(): Promise<void> {
  try {
    await unregisterAll();
  } catch {
    // Ignore
  }
  registeredShortcuts.clear();
}

export function getCurrentRegisteredShortcut(id = MAIN_WINDOW_SHORTCUT_ID): string | null {
  return registeredShortcuts.get(id) ?? null;
}
