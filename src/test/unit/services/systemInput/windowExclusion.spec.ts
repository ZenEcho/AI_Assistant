import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/window/windowManager", () => ({
  MAIN_WINDOW_LABEL: "main",
  SETTINGS_WINDOW_LABEL: "settings",
  RESULT_WINDOW_LABEL: "result",
}));

describe("systemInput windowExclusion", () => {
  it("returns a fresh list of excluded window labels", async () => {
    const {
      SYSTEM_INPUT_EXCLUDED_WINDOW_LABELS,
      resolveSystemInputExcludedWindowLabels,
    } = await import("@/services/systemInput/windowExclusion");

    const first = resolveSystemInputExcludedWindowLabels();
    first.push("other-window");

    expect(SYSTEM_INPUT_EXCLUDED_WINDOW_LABELS).toEqual(["main", "settings", "result"]);
    expect(resolveSystemInputExcludedWindowLabels()).toEqual(["main", "settings", "result"]);
  });
});
