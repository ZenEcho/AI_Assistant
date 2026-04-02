<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useSlots } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { NButton, NIcon } from "naive-ui";
import { Copy, Minus, Square, X } from "lucide-vue-next";

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    maximizable?: boolean;
  }>(),
  {
    subtitle: "",
    maximizable: true,
  },
);

const appWindow = getCurrentWindow();
const isMaximized = ref(false);
const slots = useSlots();

let unlistenResized: (() => void) | null = null;

const shouldShowDivider = computed(() => Boolean(slots.actions));

async function runWindowAction(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    console.error("Window control action failed", error);
  }
}

async function syncWindowState() {
  try {
    isMaximized.value = await appWindow.isMaximized();
  } catch (error) {
    console.error("Failed to sync window state", error);
  }
}

function handleTitleMouseDown() {
  void runWindowAction(() => appWindow.startDragging());
}

function handleMinimize() {
  void runWindowAction(() => appWindow.minimize());
}

function handleToggleMaximize() {
  void runWindowAction(async () => {
    await appWindow.toggleMaximize();
    await syncWindowState();
  });
}

function handleClose() {
  void runWindowAction(() => appWindow.close());
}

onMounted(async () => {
  await syncWindowState();
  unlistenResized = await appWindow.onResized(() => {
    void syncWindowState();
  });
});

onBeforeUnmount(() => {
  unlistenResized?.();
});
</script>

<template>
  <header class="border-b border-border/60 bg-[var(--app-surface)]">
    <div class="flex items-center gap-3 px-4 py-3">
      <div
        class="flex min-w-0 flex-1 items-center gap-3 select-none"
        @mousedown.left="handleTitleMouseDown"
        @dblclick="props.maximizable && handleToggleMaximize()"
      >
        <div class="h-2 w-2 shrink-0 rounded-full bg-[rgb(var(--app-primary-rgb))]" />
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-foreground">{{ props.title }}</p>
          <p v-if="props.subtitle" class="truncate text-xs text-muted-foreground">
            {{ props.subtitle }}
          </p>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-1.5">
        <slot name="actions" />

        <div v-if="shouldShowDivider" class="mx-1 h-5 w-px bg-border/50" />

        <n-button quaternary circle size="small" @click.stop="handleMinimize">
          <template #icon>
            <n-icon>
              <Minus />
            </n-icon>
          </template>
        </n-button>

        <n-button
          v-if="props.maximizable"
          quaternary
          circle
          size="small"
          @click.stop="handleToggleMaximize"
        >
          <template #icon>
            <n-icon>
              <component :is="isMaximized ? Copy : Square" />
            </n-icon>
          </template>
        </n-button>

        <n-button quaternary circle size="small" type="error" @click.stop="handleClose">
          <template #icon>
            <n-icon>
              <X />
            </n-icon>
          </template>
        </n-button>
      </div>
    </div>
  </header>
</template>
