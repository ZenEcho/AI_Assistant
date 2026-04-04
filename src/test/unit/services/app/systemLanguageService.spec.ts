import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
  warn: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
  isTauri: mocked.isTauri,
}));

vi.mock("@/services/logging/logger", () => ({
  createLogger: () => ({
    warn: mocked.warn,
  }),
}));

import {
  getSystemLocale,
  setCachedSystemLocale,
} from "@/services/app/systemLanguageService";

describe("systemLanguageService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.isTauri.mockReturnValue(true);
    setCachedSystemLocale(null);
  });

  it("reads and caches the locale from the native bridge", async () => {
    mocked.invoke.mockResolvedValue("zh-CN");

    const first = await getSystemLocale();
    const second = await getSystemLocale();

    expect(first).toBe("zh-CN");
    expect(second).toBe("zh-CN");
    expect(mocked.invoke).toHaveBeenCalledTimes(1);
    expect(mocked.invoke).toHaveBeenCalledWith("app_get_system_locale");
  });

  it("falls back to the browser locale and logs a warning when the native read fails", async () => {
    mocked.invoke.mockRejectedValue(new Error("boom"));
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: "fr-FR",
    });

    const locale = await getSystemLocale();

    expect(locale).toBe("fr-FR");
    expect(mocked.warn).toHaveBeenCalledWith(
      "app.system-locale.read-failed",
      "读取系统语言失败，已回退浏览器语言",
      expect.objectContaining({
        errorStack: expect.stringContaining("boom"),
      }),
    );
  });

  it("allows tests and callers to seed the cached locale directly", async () => {
    setCachedSystemLocale(" en-US ");

    const locale = await getSystemLocale();

    expect(locale).toBe("en-US");
    expect(mocked.invoke).not.toHaveBeenCalled();
  });
});
