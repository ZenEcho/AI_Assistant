import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(async () => {}),
  isTauri: vi.fn(() => true),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocked.invoke,
  isTauri: mocked.isTauri,
}));

async function importResetService() {
  vi.resetModules();
  return await import("@/services/app/resetService");
}

describe("resetService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.isTauri.mockReturnValue(true);
  });

  it("uses exit in development mode and restart in production mode", async () => {
    const { resolveResetRuntimeAction } = await importResetService();

    expect(resolveResetRuntimeAction(true)).toBe("exit");
    expect(resolveResetRuntimeAction(false)).toBe("restart");
  });

  it("clears app data before requesting the runtime action", async () => {
    const { resetSoftwareData } = await importResetService();
    const steps: string[] = [];

    await resetSoftwareData({
      runtimeAction: "restart",
      resetAppData: async () => {
        steps.push("reset");
      },
      clearHistory: async () => {
        steps.push("history");
      },
      executeRuntimeAction: async (action) => {
        steps.push(action);
      },
    });

    expect(steps).toEqual(["reset", "history", "restart"]);
  });

  it("invokes the backend runtime reset command when running in Tauri", async () => {
    const { executeResetRuntimeAction } = await importResetService();

    await executeResetRuntimeAction("restart");

    expect(mocked.invoke).toHaveBeenCalledWith("reset_app_runtime", {
      action: "restart",
    });
  });
});
