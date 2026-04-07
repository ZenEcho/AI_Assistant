import { describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  const app = {
    use: vi.fn(),
    mount: vi.fn(),
    config: {},
  };

  return {
    app,
    createApp: vi.fn(() => app),
    createPinia: vi.fn(() => ({ pinia: true })),
    watch: vi.fn(),
    startLogBridge: vi.fn().mockResolvedValue(undefined),
    updateAppLogRuntimeConfig: vi.fn().mockResolvedValue(undefined),
    installConsoleCapture: vi.fn(),
    flushLogs: vi.fn().mockResolvedValue(undefined),
    useAppConfigStore: vi.fn(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      preferences: {
        logging: {
          captureFrontendErrors: true,
        },
        themeMode: "auto",
      },
    })),
    useTranslationStore: vi.fn(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
    })),
    useSystemInputStore: vi.fn(),
    refreshSystemLocale: vi.fn().mockResolvedValue("zh-CN"),
    resolveThemeMode: vi.fn(() => "light"),
    applyThemeToDom: vi.fn(),
  };
});

vi.mock("vue", () => ({
  createApp: mocked.createApp,
  watch: mocked.watch,
}));

vi.mock("pinia", () => ({
  createPinia: mocked.createPinia,
}));

vi.mock("@/App.vue", () => ({
  default: {},
}));

vi.mock("@/router", () => ({
  default: {},
}));

vi.mock("@/services/logging/consoleCapture", () => ({
  installConsoleCapture: mocked.installConsoleCapture,
}));

vi.mock("@/services/logging/logEmitter", () => ({
  flushLogs: mocked.flushLogs,
}));

vi.mock("@/services/logging/logger", () => ({
  appLogger: {
    error: vi.fn(),
  },
}));

vi.mock("@/services/logging/logBridge", () => ({
  startLogBridge: mocked.startLogBridge,
}));

vi.mock("@/services/logging/logStorage", () => ({
  updateAppLogRuntimeConfig: mocked.updateAppLogRuntimeConfig,
}));

vi.mock("@/stores/appConfig", () => ({
  useAppConfigStore: mocked.useAppConfigStore,
}));

vi.mock("@/stores/systemInput", () => ({
  useSystemInputStore: mocked.useSystemInputStore,
}));

vi.mock("@/stores/translation", () => ({
  useTranslationStore: mocked.useTranslationStore,
}));

vi.mock("@/utils/theme", () => ({
  applyThemeToDom: mocked.applyThemeToDom,
  resolveThemeMode: mocked.resolveThemeMode,
}));

vi.mock("@/utils/error", () => ({
  toErrorStack: vi.fn(),
}));

vi.mock("@/services/app/systemLanguageService", () => ({
  refreshSystemLocale: mocked.refreshSystemLocale,
}));

vi.mock("virtual:uno.css", () => ({}));
vi.mock("@/assets/styles/main.css", () => ({}));

describe("main bootstrap", () => {
  it("refreshes the system locale during startup", async () => {
    vi.resetModules();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });

    await import("@/main");

    expect(mocked.refreshSystemLocale).toHaveBeenCalledTimes(1);
  });
});
