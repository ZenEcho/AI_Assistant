import { invoke, isTauri } from "@tauri-apps/api/core";
import { createLogger } from "@/services/logging/logger";
import { toErrorStack } from "@/utils/error";

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

async function readSystemLocale() {
  if (isTauri()) {
    try {
      const locale = await invoke<string>("app_get_system_locale");

      if (typeof locale === "string" && locale.trim()) {
        return locale.trim();
      }
    } catch (error) {
      await logger.warn("app.system-locale.read-failed", "璇诲彇绯荤粺璇█澶辫触锛屽凡鍥為€€娴忚鍣ㄨ瑷€", {
        errorStack: toErrorStack(error),
      });
    }
  }

  return resolveBrowserLocale();
}

export async function getSystemLocale() {
  if (cachedSystemLocale) {
    return cachedSystemLocale;
  }

  cachedSystemLocale = await readSystemLocale();
  return cachedSystemLocale;
}

export async function refreshSystemLocale() {
  cachedSystemLocale = await readSystemLocale();
  return cachedSystemLocale;
}

export function setCachedSystemLocale(locale: string | null) {
  cachedSystemLocale = locale?.trim() || null;
}
