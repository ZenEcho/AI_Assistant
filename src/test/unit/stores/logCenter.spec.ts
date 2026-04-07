import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppLogRecord } from "@/types/log";

const mocked = vi.hoisted(() => ({
  queryAppLogs: vi.fn(async () => []),
  clearAppLogs: vi.fn(async () => undefined),
}));

vi.mock("@/services/logging/logStorage", () => ({
  queryAppLogs: mocked.queryAppLogs,
  clearAppLogs: mocked.clearAppLogs,
}));

import { useLogCenterStore } from "@/stores/logCenter";

function createLogRecord(overrides?: Partial<AppLogRecord>): AppLogRecord {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    timestamp: overrides?.timestamp ?? new Date().toISOString(),
    category: overrides?.category ?? "frontend",
    level: overrides?.level ?? "error",
    tag: overrides?.tag ?? "vue-runtime",
    message: overrides?.message ?? "test message",
    detail: overrides?.detail ?? null,
    stack: overrides?.stack ?? null,
    ingestSeq: overrides?.ingestSeq ?? 1,
  };
}

describe("useLogCenterStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("deduplicates incoming logs by id", () => {
    const store = useLogCenterStore();
    const record = createLogRecord({
      id: "same-id",
    });

    store.append(record);
    store.append(record);

    expect(store.items).toHaveLength(1);
  });

  it("buffers logs while paused and flushes them on resume", () => {
    const store = useLogCenterStore();
    const pausedRecord = createLogRecord({
      id: "paused-1",
      ingestSeq: 2,
    });

    store.paused = true;
    store.append(pausedRecord);

    expect(store.items).toHaveLength(0);
    expect(store.pendingItems).toHaveLength(1);
    expect(store.pendingCount).toBe(1);

    store.paused = false;
    store.flushPending();

    expect(store.pendingItems).toHaveLength(0);
    expect(store.items).toHaveLength(1);
    expect(store.items[0]?.id).toBe("paused-1");
  });

  it("passes level, category, and tag filters to refresh query", async () => {
    const store = useLogCenterStore();
    mocked.queryAppLogs.mockResolvedValue([]);

    store.filters.levels = ["warn"];
    store.filters.categories = ["desktop"];
    store.filters.tags = ["window-manager"];
    store.filters.keyword = "timeout";

    await store.refresh();

    expect(mocked.queryAppLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        levels: ["warn"],
        categories: ["desktop"],
        tags: ["window-manager"],
        keyword: "timeout",
      }),
    );
  });

  it("filters visible items by level, category, tag, and keyword", () => {
    const store = useLogCenterStore();

    store.items = [
      createLogRecord({
        id: "frontend-1",
        category: "frontend",
        level: "error",
        tag: "vue-runtime",
        message: "frontend boom",
      }),
      createLogRecord({
        id: "desktop-1",
        category: "desktop",
        level: "warn",
        tag: "window-manager",
        message: "window timeout",
      }),
    ];

    store.filters.levels = ["warn"];
    store.filters.categories = ["desktop"];
    store.filters.tags = ["window-manager"];
    store.filters.keyword = "timeout";

    expect(store.visibleItems).toHaveLength(1);
    expect(store.visibleItems[0]?.id).toBe("desktop-1");
  });
});
