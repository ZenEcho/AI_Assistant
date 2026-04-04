import { invoke, isTauri } from "@tauri-apps/api/core";
import { createLogger } from "@/services/logging/logger";

let cachedSystemLocale: string | null = null;
const logger = createLogger({
  source: "service",
  category: "app",
});

function resolveBrowserLocale() {
  if (typeof navigator !== "undefined" && navigator.language.trim()) {
    return navigator.language.trim();
  }

  const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale?.trim();
  return intlLocale || "en-US";
}

export async function getSystemLocale() {
  if (cachedSystemLocale) {
    return cachedSystemLocale;
  }

  if (isTauri()) {
    try {
      const locale = await invoke<string>("app_get_system_locale");

      if (typeof locale === "string" && locale.trim()) {
        cachedSystemLocale = locale.trim();
        return cachedSystemLocale;
      }
    } catch (error) {
      await logger.warn("app.system-locale.read-failed", "读取系统语言失败，已回退浏览器语言", {
        errorStack: error instanceof Error ? error.stack : String(error),
      });
    }
  }

  cachedSystemLocale = resolveBrowserLocale();
  return cachedSystemLocale;
}

export function setCachedSystemLocale(locale: string | null) {
  cachedSystemLocale = locale?.trim() || null;
}
