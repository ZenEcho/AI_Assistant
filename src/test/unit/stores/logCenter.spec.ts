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
    level: overrides?.level ?? "info",
    category: overrides?.category ?? "app",
    source: overrides?.source ?? "frontend",
    action: overrides?.action ?? "test.action",
    message: overrides?.message ?? "test message",
    detail: overrides?.detail ?? null,
    context: overrides?.context ?? null,
    windowLabel: overrides?.windowLabel ?? "main",
    requestId: overrides?.requestId ?? null,
    traceId: overrides?.traceId ?? null,
    relatedEntity: overrides?.relatedEntity ?? null,
    success: overrides?.success ?? null,
    durationMs: overrides?.durationMs ?? null,
    errorCode: overrides?.errorCode ?? null,
    errorStack: overrides?.errorStack ?? null,
    ingestSeq: overrides?.ingestSeq ?? 1,
    visibility: overrides?.visibility ?? "user",
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

  it("passes time range and filter params to refresh query", async () => {
    const store = useLogCenterStore();
    mocked.queryAppLogs.mockResolvedValue([]);

    store.filters.keyword = "timeout";
    store.filters.requestId = "req-1";
    store.filters.traceId = "trace-1";
    store.filters.startTime = new Date("2026-04-04T10:00:00.000Z").getTime();
    store.filters.endTime = new Date("2026-04-04T12:00:00.000Z").getTime();

    await store.refresh();

    expect(mocked.queryAppLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: "timeout",
        requestId: "req-1",
        traceId: "trace-1",
        startTime: "2026-04-04T10:00:00.000Z",
        endTime: "2026-04-04T12:00:00.000Z",
      }),
    );
  });
});
