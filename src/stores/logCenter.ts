import { computed, ref, watch } from "vue";
import { acceptHMRUpdate, defineStore } from "pinia";
import { APP_LOG_VIEWER_LIMIT } from "@/constants/logging";
import { clearAppLogs, queryAppLogs } from "@/services/logging/logStorage";
import type { AppLogCategory, AppLogLevel, AppLogQuery, AppLogRecord } from "@/types/log";

interface LogFilters {
  levels: AppLogLevel[];
  categories: AppLogCategory[];
  tags: string[];
  keyword: string;
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
    tags: [],
    keyword: "",
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
      tags: filters.value.tags,
      keyword: filters.value.keyword.trim(),
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
      tags: [],
      keyword: "",
    };
  }

  const visibleItems = computed(() =>
    items.value.filter((item) => {
      const keyword = filters.value.keyword.trim().toLowerCase();
      const haystack = [
        item.message,
        item.tag,
        typeof item.detail === "string" ? item.detail : "",
      ]
        .join(" ")
        .toLowerCase();

      return includesFilter(filters.value.categories, item.category) &&
        includesFilter(filters.value.levels, item.level) &&
        includesFilter(filters.value.tags, item.tag) &&
        (!keyword || haystack.includes(keyword));
    }),
  );

  const availableTags = computed(() =>
    [...new Set(items.value.map((item) => item.tag))]
      .sort((left, right) => left.localeCompare(right)),
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
    availableTags,
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
