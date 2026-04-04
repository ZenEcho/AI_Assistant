import { computed, ref, watch } from "vue";
import { acceptHMRUpdate, defineStore } from "pinia";
import { APP_LOG_VIEWER_LIMIT } from "@/constants/logging";
import { clearAppLogs, queryAppLogs } from "@/services/logging/logStorage";
import type { AppLogCategory, AppLogLevel, AppLogQuery, AppLogRecord, AppLogSource } from "@/types/log";

interface LogFilters {
  levels: AppLogLevel[];
  categories: AppLogCategory[];
  sources: AppLogSource[];
  keyword: string;
  requestId: string;
  traceId: string;
  startTime: number | null;
  endTime: number | null;
}

function includesFilter<T>(filters: T[], value: T) {
  return filters.length === 0 || filters.includes(value);
}

export const useLogCenterStore = defineStore("log-center", () => {
  const items = ref<AppLogRecord[]>([]);
  const pendingItems = ref<AppLogRecord[]>([]);
  const loading = ref(false);
  const paused = ref(false);
  const autoScroll = ref(true);
  const filters = ref<LogFilters>({
    levels: [],
    categories: [],
    sources: [],
    keyword: "",
    requestId: "",
    traceId: "",
    startTime: null,
    endTime: null,
  });

  function compareLogs(left: AppLogRecord, right: AppLogRecord) {
    const leftSeq = left.ingestSeq ?? 0;
    const rightSeq = right.ingestSeq ?? 0;

    if (leftSeq !== rightSeq) {
      return rightSeq - leftSeq;
    }

    return right.timestamp.localeCompare(left.timestamp);
  }

  function mergeLogs(currentItems: AppLogRecord[], incomingItems: AppLogRecord[]) {
    const merged = new Map<string, AppLogRecord>();

    [...currentItems, ...incomingItems].forEach((item) => {
      merged.set(item.id, item);
    });

    return [...merged.values()]
      .sort(compareLogs)
      .slice(0, APP_LOG_VIEWER_LIMIT);
  }

  function buildQueryFromFilters(overrides: AppLogQuery = {}): AppLogQuery {
    return {
      limit: APP_LOG_VIEWER_LIMIT,
      levels: filters.value.levels,
      categories: filters.value.categories,
      sources: filters.value.sources,
      keyword: filters.value.keyword.trim(),
      requestId: filters.value.requestId.trim(),
      traceId: filters.value.traceId.trim(),
      startTime: filters.value.startTime ? new Date(filters.value.startTime).toISOString() : undefined,
      endTime: filters.value.endTime ? new Date(filters.value.endTime).toISOString() : undefined,
      ...overrides,
    };
  }

  function append(record: AppLogRecord) {
    if (items.value.some((item) => item.id === record.id) ||
      pendingItems.value.some((item) => item.id === record.id)) {
      return;
    }

    if (paused.value) {
      pendingItems.value = mergeLogs(pendingItems.value, [record]);
      return;
    }

    items.value = mergeLogs(items.value, [record]);
  }

  function flushPending() {
    if (pendingItems.value.length === 0) {
      return;
    }

    items.value = mergeLogs(items.value, pendingItems.value);
    pendingItems.value = [];
  }

  async function refresh(query: AppLogQuery = {}) {
    loading.value = true;

    try {
      items.value = await queryAppLogs(buildQueryFromFilters(query));
    } finally {
      loading.value = false;
    }
  }

  async function clear() {
    await clearAppLogs();
    items.value = [];
    pendingItems.value = [];
  }

  function resetFilters() {
    filters.value = {
      levels: [],
      categories: [],
      sources: [],
      keyword: "",
      requestId: "",
      traceId: "",
      startTime: null,
      endTime: null,
    };
  }

  const visibleItems = computed(() =>
    items.value.filter((item) => {
      const keyword = filters.value.keyword.trim().toLowerCase();
      const requestId = filters.value.requestId.trim();
      const traceId = filters.value.traceId.trim();
      const startTime = filters.value.startTime
        ? new Date(filters.value.startTime).toISOString()
        : "";
      const endTime = filters.value.endTime
        ? new Date(filters.value.endTime).toISOString()
        : "";
      const haystack = [
        item.message,
        item.action,
        item.source,
        item.category,
        item.requestId ?? "",
        item.traceId ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return includesFilter(filters.value.levels, item.level) &&
        includesFilter(filters.value.categories, item.category) &&
        includesFilter(filters.value.sources, item.source) &&
        (!startTime || item.timestamp >= startTime) &&
        (!endTime || item.timestamp <= endTime) &&
        (!keyword || haystack.includes(keyword)) &&
        (!requestId || item.requestId === requestId) &&
        (!traceId || item.traceId === traceId);
    }),
  );

  const pendingCount = computed(() => pendingItems.value.length);

  watch(paused, (value) => {
    if (!value) {
      flushPending();
    }
  });

  return {
    items,
    pendingItems,
    pendingCount,
    loading,
    paused,
    autoScroll,
    filters,
    visibleItems,
    append,
    flushPending,
    refresh,
    clear,
    resetFilters,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useLogCenterStore, import.meta.hot));
}
