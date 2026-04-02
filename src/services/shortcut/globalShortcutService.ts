import {
  register,
  unregister,
  unregisterAll,
} from "@tauri-apps/plugin-global-shortcut";
import { toggleTranslationWindowVisibility } from "@/services/window/windowManager";

export interface ShortcutRegistrationResult {
  success: boolean;
  conflict: boolean;
  error?: string;
}

let currentShortcut: string | null = null;

export async function registerGlobalShortcut(
  shortcut: string,
): Promise<ShortcutRegistrationResult> {
  // Unregister old shortcut first
  if (currentShortcut) {
    try {
      await unregister(currentShortcut);
    } catch {
      // Ignore errors when unregistering old shortcut
    }
    currentShortcut = null;
  }

  try {
    await register(shortcut, (event) => {
      if (event.state === "Pressed") {
        void toggleTranslationWindowVisibility();
      }
    });

    currentShortcut = shortcut;
    return { success: true, conflict: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isConflict =
      message.toLowerCase().includes("already registered") ||
      message.toLowerCase().includes("occupied") ||
      message.toLowerCase().includes("hotkey") ||
      message.toLowerCase().includes("accelerator");

    return {
      success: false,
      conflict: isConflict,
      error: `注册快捷键失败：${message}`,
    };
  }
}

export async function unregisterGlobalShortcut(): Promise<void> {
  if (currentShortcut) {
    try {
      await unregister(currentShortcut);
    } catch {
      // Ignore
    }
    currentShortcut = null;
  }
}

export async function unregisterAllShortcuts(): Promise<void> {
  try {
    await unregisterAll();
  } catch {
    // Ignore
  }
  currentShortcut = null;
}

export function getCurrentRegisteredShortcut(): string | null {
  return currentShortcut;
}
