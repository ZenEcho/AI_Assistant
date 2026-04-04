import { createApp, watch } from "vue";
import { createPinia } from "pinia";
import App from "@/App.vue";
import router from "@/router";
import { installConsoleCapture } from "@/services/logging/consoleCapture";
import { flushLogs } from "@/services/logging/logEmitter";
import { appLogger } from "@/services/logging/logger";
import { startLogBridge } from "@/services/logging/logBridge";
import { toErrorStack } from "@/utils/error";
import { updateAppLogRuntimeConfig } from "@/services/logging/logStorage";
import { useAppConfigStore } from "@/stores/appConfig";
import { useSystemInputStore } from "@/stores/systemInput";
import { useTranslationStore } from "@/stores/translation";
import { applyThemeToDom, resolveThemeMode } from "@/utils/theme";
import "virtual:uno.css";
import "@/assets/styles/main.css";

async function bootstrap() {
  const app = createApp(App);
  const pinia = createPinia();

  app.use(pinia);
  await startLogBridge();

  const appConfigStore = useAppConfigStore(pinia);
  await appConfigStore.initialize();
  await updateAppLogRuntimeConfig(appConfigStore.preferences.logging);
  installConsoleCapture();
  const translationStore = useTranslationStore(pinia);
  await translationStore.initialize();
  useSystemInputStore(pinia);

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  applyThemeToDom({
    resolvedMode: resolveThemeMode(appConfigStore.preferences.themeMode, prefersDark),
  });

  app.config.errorHandler = (error, instance, info) => {
    if (!appConfigStore.preferences.logging.captureFrontendErrors) {
      return;
    }

    void appLogger.error("vue.runtime-error", "前端运行时错误", {
      category: "error",
      source: "frontend",
      detail: {
        info,
        component: instance?.$options?.name ?? "anonymous-component",
      },
      errorStack: toErrorStack(error),
    });
  };

  window.addEventListener("error", (event) => {
    if (!appConfigStore.preferences.logging.captureFrontendErrors) {
      return;
    }

    void appLogger.error("window.error", "捕获到未处理前端错误", {
      category: "error",
      source: "frontend",
      detail: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
      errorStack: event.error instanceof Error ? event.error.stack : event.message,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (!appConfigStore.preferences.logging.captureFrontendErrors) {
      return;
    }

    void appLogger.error("window.unhandledrejection", "捕获到未处理 Promise 异常", {
      category: "error",
      source: "frontend",
      detail: {
        reason:
          event.reason instanceof Error
            ? event.reason.message
            : String(event.reason),
      },
      errorStack: event.reason instanceof Error ? event.reason.stack : undefined,
    });
  });

  window.addEventListener("pagehide", () => {
    void flushLogs();
  });

  watch(
    () => appConfigStore.preferences.logging,
    (loggingPreferences) => {
      void updateAppLogRuntimeConfig(loggingPreferences);
    },
    { deep: true },
  );

  app.use(router);
  app.mount("#app");

  void appLogger.info("app.bootstrap", "应用前端初始化完成", {
    category: "app",
    source: "frontend",
  });
}

void bootstrap();
