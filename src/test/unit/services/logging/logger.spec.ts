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
        minLevel: "info",
        enableVerboseDebug: false,
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
    mocked.appConfigStore.preferences.logging.minLevel = "info";
    mocked.appConfigStore.preferences.logging.enableVerboseDebug = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("filters logs below the configured minimum level", async () => {
    mocked.appConfigStore.preferences.logging.minLevel = "warn";
    const logger = createLogger({
      source: "service",
      category: "app",
    });

    await logger.info("app.info", "ignored");
    await logger.error("app.error", "written");

    expect(mocked.emitLog).toHaveBeenCalledTimes(1);
    expect(mocked.emitLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        action: "app.error",
        windowLabel: "settings",
      }),
    );
  });

  it("treats verbose debug as a trace-level override", async () => {
    mocked.appConfigStore.preferences.logging.minLevel = "fatal";
    mocked.appConfigStore.preferences.logging.enableVerboseDebug = true;
    const logger = createLogger({
      source: "service",
      category: "debug",
    });

    await logger.trace("debug.trace", "visible");

    expect(mocked.emitLog).toHaveBeenCalledTimes(1);
    expect(mocked.emitLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "trace",
        action: "debug.trace",
      }),
    );
  });

  it("tracks failures with a shared request id, duration, and error stack", async () => {
    const nowSpy = vi.spyOn(performance, "now");
    nowSpy.mockReturnValueOnce(100).mockReturnValueOnce(155);
    const logger = createLogger({
      source: "service",
      category: "translation",
      traceId: "trace-1",
      windowLabel: "result",
    });

    await expect(
      logger.track("translation.run", "执行翻译", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(mocked.emitLog).toHaveBeenCalledTimes(2);
    const startRecord = mocked.emitLog.mock.calls[0]?.[0];
    const failureRecord = mocked.emitLog.mock.calls[1]?.[0];

    expect(startRecord).toBeDefined();
    expect(failureRecord).toBeDefined();

    if (!startRecord || !failureRecord) {
      throw new Error("Expected logger.track to emit start and failure records");
    }

    expect(startRecord).toEqual(
      expect.objectContaining({
        level: "info",
        action: "translation.run.start",
        requestId: expect.any(String),
        traceId: "trace-1",
        windowLabel: "result",
      }),
    );
    expect(failureRecord).toEqual(
      expect.objectContaining({
        level: "error",
        action: "translation.run.failed",
        requestId: startRecord.requestId,
        success: false,
        durationMs: 55,
        errorStack: expect.stringContaining("boom"),
      }),
    );
  });
});
