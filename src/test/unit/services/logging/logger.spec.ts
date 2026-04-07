import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppLogRecord } from "@/types/log";

const mocked = vi.hoisted(() => ({
  emitLog: vi.fn(async (_record: AppLogRecord) => undefined),
  currentWindow: {
    label: "settings",
  },
  appConfigStore: {
    preferences: {
      logging: {
        enabled: true,
      },
    },
  },
}));

vi.mock("@/services/logging/logEmitter", () => ({
  emitLog: mocked.emitLog,
}));

vi.mock("@/stores/appConfig", () => ({
  useAppConfigStore: () => mocked.appConfigStore,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => mocked.currentWindow,
}));

import { createLogger } from "@/services/logging/logger";

describe("logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.appConfigStore.preferences.logging.enabled = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes informational logs with level info", async () => {
    const logger = createLogger({
      source: "service",
    });

    await logger.info("translation.start", "started");

    expect(mocked.emitLog).toHaveBeenCalledTimes(1);
    expect(mocked.emitLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        message: "started",
      }),
    );
  });

  it("writes frontend errors with explicit category and tag", async () => {
    const logger = createLogger({
      source: "frontend",
    });

    await logger.error("vue.runtime-error", "前端运行时错误", {
      category: "frontend",
      tag: "vue-runtime",
      detail: {
        component: "AppRoot",
      },
      errorStack: "boom",
    });

    expect(mocked.emitLog).toHaveBeenCalledTimes(1);
    expect(mocked.emitLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "frontend",
        tag: "vue-runtime",
        level: "error",
        message: "前端运行时错误",
        stack: "boom",
        windowLabel: "settings",
      }),
    );
  });

  it("maps tauri source errors to the desktop category", async () => {
    const logger = createLogger({
      source: "tauri",
    });

    await logger.error("system-input.invoke.failed", "系统输入 invoke 失败", {
      detail: {
        command: "system_input_get_status",
      },
    });

    expect(mocked.emitLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "desktop",
        tag: "tauri",
        level: "error",
      }),
    );
  });

  it("records warnings with warn level", async () => {
    const logger = createLogger({
      source: "window-manager",
    });

    await logger.warn("window.result.ready-timeout", "结果窗口等待超时", {
      errorStack: "timeout",
    });

    expect(mocked.emitLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "desktop",
        tag: "window-manager",
        level: "warn",
        stack: "timeout",
      }),
    );
  });
});
