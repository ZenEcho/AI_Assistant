<script setup lang="ts">
import { computed, h, nextTick, onMounted, ref, watch } from "vue";
import {
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NDataTable,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NInput,
  NInputNumber,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
  NText,
  useMessage,
  type DataTableColumns,
  type DataTableRowKey,
} from "naive-ui";
import { appLogCategoryLabels, appLogLevelLabels } from "@/constants/logging";
import { exportLogs } from "@/services/logging/logExport";
import { useAppConfigStore } from "@/stores/appConfig";
import { useLogCenterStore } from "@/stores/logCenter";
import type { AppLogCategory, AppLogLevel, AppLogRecord } from "@/types/log";

const logStore = useLogCenterStore();
const appConfigStore = useAppConfigStore();
const message = useMessage();
const activeRecord = ref<AppLogRecord | null>(null);
const detailSections = ref<Array<"detail" | "stack">>(["detail"]);
const tableContainerRef = ref<HTMLElement | null>(null);

const detailDrawerVisible = computed({
  get: () => Boolean(activeRecord.value),
  set: (value: boolean) => {
    if (!value) {
      activeRecord.value = null;
    }
  },
});

const levelOptions = computed(() =>
  Object.entries(appLogLevelLabels).map(([value, label]) => ({
    label,
    value: value as AppLogLevel,
  })),
);

const categoryOptions = computed(() =>
  Object.entries(appLogCategoryLabels).map(([value, label]) => ({
    label,
    value: value as AppLogCategory,
  })),
);

const tagOptions = computed(() =>
  logStore.availableTags.map((tag) => ({
    label: tag,
    value: tag,
  })),
);

const columns = computed<DataTableColumns<AppLogRecord>>(() => [
  {
    title: "时间",
    key: "timestamp",
    width: 190,
  },
  {
    title: "等级",
    key: "level",
    width: 90,
    render(row) {
      return h(
        NTag,
        {
          size: "small",
          type: row.level === "error"
            ? "error"
            : row.level === "warn"
              ? "warning"
              : "default",
        },
        {
          default: () => appLogLevelLabels[row.level],
        },
      );
    },
  },
  {
    title: "分类",
    key: "category",
    width: 110,
    render(row) {
      return h(
        NTag,
        {
          size: "small",
          type: row.category === "frontend"
            ? "warning"
            : row.category === "desktop"
              ? "info"
              : "error",
        },
        {
          default: () => appLogCategoryLabels[row.category],
        },
      );
    },
  },
  {
    title: "标签",
    key: "tag",
    width: 180,
  },
  {
    title: "消息",
    key: "message",
    ellipsis: {
      tooltip: true,
    },
  },
]);

async function refresh() {
  await logStore.refresh();
}

async function handleSearch() {
  await refresh();
}

async function handleResetFilters() {
  logStore.resetFilters();
  await refresh();
}

async function handleClear() {
  await logStore.clear();
  message.success("日志已清空");
}

async function handleExport(format: "json" | "txt") {
  const result = await exportLogs({
    format,
    levels: logStore.filters.levels,
    categories: logStore.filters.categories,
    tags: logStore.filters.tags,
    keyword: logStore.filters.keyword,
    limit: 5000,
  });

  message.success(`已导出 ${result.count} 条日志到 ${result.path}`);
}

async function handleRetainDaysChange(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return;
  }

  await appConfigStore.updateLoggingPreferences({
    retainDays: value,
  });
}

async function handleMaxEntriesChange(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return;
  }

  await appConfigStore.updateLoggingPreferences({
    maxEntries: value,
  });
}

async function handleMaxSizeChange(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return;
  }

  await appConfigStore.updateLoggingPreferences({
    maxFileSizeMb: value,
  });
}

async function handleCaptureFrontendErrorsChange(value: boolean) {
  await appConfigStore.updateLoggingPreferences({
    captureFrontendErrors: value,
  });
}

async function handleCaptureConsoleErrorsChange(value: boolean) {
  await appConfigStore.updateLoggingPreferences({
    captureConsoleErrors: value,
  });
}

function handlePausedChange(value: boolean) {
  logStore.paused = value;

  if (!value) {
    logStore.flushPending();
  }
}

function handleAutoScrollChange(value: boolean) {
  logStore.autoScroll = value;
}

function handleRowClick(row: AppLogRecord) {
  activeRecord.value = row;
  detailSections.value = [
    ...(row.detail ? ["detail" as const] : []),
    ...(row.stack ? ["stack" as const] : []),
  ];
}

function rowProps(row: AppLogRecord) {
  return {
    style: "cursor: pointer;",
    onClick: () => handleRowClick(row),
  };
}

function rowKey(row: AppLogRecord): DataTableRowKey {
  return row.id;
}

async function scrollTableToLatest() {
  if (!logStore.autoScroll) {
    return;
  }

  await nextTick();
  const body = tableContainerRef.value?.querySelector<HTMLElement>(".n-data-table-base-table-body");

  if (!body) {
    return;
  }

  body.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

onMounted(() => {
  void refresh();
});

watch(
  () => logStore.visibleItems[0]?.id,
  () => {
    if (logStore.paused) {
      return;
    }

    void scrollTableToLatest();
  },
);
</script>

<template>
  <div class="flex flex-col gap-4">
    <n-card title="日志中心" :bordered="false">
      <div class="mb-4 flex flex-col gap-3">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div class="min-w-0">
            <n-select
              v-model:value="logStore.filters.levels"
              multiple
              clearable
              placeholder="筛选等级"
              :options="levelOptions"
              class="w-full"
            />
          </div>
          <div class="min-w-0">
            <n-select
              v-model:value="logStore.filters.categories"
              multiple
              clearable
              placeholder="筛选分类"
              :options="categoryOptions"
              class="w-full"
            />
          </div>
          <div class="min-w-0">
            <n-select
              v-model:value="logStore.filters.tags"
              multiple
              clearable
              placeholder="筛选标签"
              :options="tagOptions"
              class="w-full"
            />
          </div>
          <div class="min-w-0">
            <n-input
              v-model:value="logStore.filters.keyword"
              clearable
              placeholder="搜索标签或消息"
              class="w-full"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <n-button type="primary" @click="handleSearch">查询</n-button>
          <n-button secondary @click="handleResetFilters">重置筛选</n-button>
        </div>
      </div>

      <div class="mb-4 grid gap-3 rounded-2xl border border-border/60 bg-[var(--app-surface)] p-4 lg:grid-cols-3">
        <label class="flex flex-col gap-2">
          <span class="text-xs text-muted-foreground">保留天数</span>
          <n-input-number
            :value="appConfigStore.preferences.logging.retainDays"
            :min="1"
            :max="90"
            size="small"
            @update:value="handleRetainDaysChange"
          />
        </label>
        <label class="flex flex-col gap-2">
          <span class="text-xs text-muted-foreground">最大日志条数</span>
          <n-input-number
            :value="appConfigStore.preferences.logging.maxEntries"
            :min="200"
            :max="100000"
            size="small"
            @update:value="handleMaxEntriesChange"
          />
        </label>
        <label class="flex flex-col gap-2">
          <span class="text-xs text-muted-foreground">最大存储体积（MB）</span>
          <n-input-number
            :value="appConfigStore.preferences.logging.maxFileSizeMb"
            :min="1"
            :max="200"
            size="small"
            @update:value="handleMaxSizeChange"
          />
        </label>
      </div>

      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <n-space align="center">
          <n-text depth="3">前端异常捕获</n-text>
          <n-switch
            :value="appConfigStore.preferences.logging.captureFrontendErrors"
            @update:value="handleCaptureFrontendErrorsChange"
          />
          <n-text depth="3">Console 捕获</n-text>
          <n-switch
            :value="appConfigStore.preferences.logging.captureConsoleErrors"
            @update:value="handleCaptureConsoleErrorsChange"
          />
          <n-text depth="3">暂停实时刷新</n-text>
          <n-switch :value="logStore.paused" @update:value="handlePausedChange" />
          <n-text depth="3">自动滚动</n-text>
          <n-switch :value="logStore.autoScroll" @update:value="handleAutoScrollChange" />
          <n-text depth="3">当前 {{ logStore.visibleItems.length }} 条</n-text>
          <n-text v-if="logStore.paused && logStore.pendingCount > 0" depth="3">
            暂存 {{ logStore.pendingCount }} 条
          </n-text>
        </n-space>

        <n-space>
          <n-button @click="refresh">刷新</n-button>
          <n-button @click="handleExport('json')">导出 JSON</n-button>
          <n-button @click="handleExport('txt')">导出 TXT</n-button>
          <n-button type="error" secondary @click="handleClear">清空日志</n-button>
        </n-space>
      </div>

      <n-empty
        v-if="!logStore.loading && logStore.visibleItems.length === 0"
        description="当前没有匹配的日志"
      />
      <div v-else ref="tableContainerRef">
        <n-data-table
          :columns="columns"
          :data="logStore.visibleItems"
          :row-key="rowKey"
          :row-props="rowProps"
          :loading="logStore.loading"
          :max-height="620"
          :virtual-scroll="true"
          size="small"
          striped
          remote
        />
      </div>
    </n-card>

    <n-drawer v-model:show="detailDrawerVisible" :width="560" placement="right">
      <n-drawer-content title="日志详情" closable>
        <template v-if="activeRecord">
          <div class="flex flex-col gap-4 text-sm">
            <div><strong>时间：</strong>{{ activeRecord.timestamp }}</div>
            <div><strong>等级：</strong>{{ appLogLevelLabels[activeRecord.level] }}</div>
            <div><strong>分类：</strong>{{ appLogCategoryLabels[activeRecord.category] }}</div>
            <div><strong>标签：</strong>{{ activeRecord.tag }}</div>
            <div><strong>消息：</strong>{{ activeRecord.message }}</div>
            <n-collapse v-model:expanded-names="detailSections">
              <n-collapse-item v-if="activeRecord.detail" title="detail" name="detail">
                <pre class="overflow-auto rounded-xl bg-black/5 p-3 text-xs">{{ JSON.stringify(activeRecord.detail, null, 2) }}</pre>
              </n-collapse-item>
              <n-collapse-item v-if="activeRecord.stack" title="stack" name="stack">
                <pre class="overflow-auto rounded-xl bg-black/5 p-3 text-xs">{{ activeRecord.stack }}</pre>
              </n-collapse-item>
            </n-collapse>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>
