<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { defaultWindowIcon, getName } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Menu } from "@tauri-apps/api/menu";
import { TrayIcon, type TrayIconEvent } from "@tauri-apps/api/tray";
import { CloseRequestedEvent, getCurrentWindow } from "@tauri-apps/api/window";
import { NButton, NCheckbox, NModal, NText, useMessage } from "naive-ui";
import { useAppConfigStore } from "@/stores/appConfig";
import type { CloseBehavior } from "@/types/app";

const appConfigStore = useAppConfigStore();
const { preferences } = storeToRefs(appConfigStore);
const message = useMessage();
const appWindow = getCurrentWindow();

const closeModalVisible = ref(false);
const rememberChoice = ref(false);
const pendingChoice = ref<Exclude<CloseBehavior, "ask">>("hide-to-tray");
const choicePending = ref(false);

const closeChoices = computed(() => [
  {
    value: "hide-to-tray" as const,
    title: "隐藏到托盘",
    description: "窗口会隐藏到系统托盘，应用继续在后台运行，可随时从托盘重新打开。",
  },
  {
    value: "close" as const,
    title: "直接退出",
    description: "关闭主窗口并退出应用，本次运行的后台进程也会结束。",
  },
]);

let tray: TrayIcon | null = null;
let trayPromise: Promise<void> | null = null;
let unlistenCloseRequested: (() => void) | null = null;

function formatErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "未知错误";
}

async function showMainWindow() {
  await appWindow.show();
  await appWindow.unminimize();
  await appWindow.setFocus();
}

async function performWindowClose() {
  closeModalVisible.value = false;

  try {
    await invoke("exit_app");
  } catch (error) {
    console.error("Failed to exit application", error);
    message.error(`退出应用失败：${formatErrorMessage(error)}`);
  }
}

function handleTrayAction(event: TrayIconEvent) {
  const isLeftClick =
    event.type === "Click" && event.button === "Left" && event.buttonState === "Up";
  const isDoubleClick = event.type === "DoubleClick";

  if (isLeftClick || isDoubleClick) {
    void showMainWindow();
  }
}

async function ensureTray() {
  if (!isTauri() || tray) {
    return;
  }

  if (trayPromise) {
    return trayPromise;
  }

  trayPromise = (async () => {
    const appName = await getName();
    const icon = await defaultWindowIcon();
    const menu = await Menu.new({
      items: [
        {
          id: "show-main-window",
          text: "显示主窗口",
          action: () => {
            void showMainWindow();
          },
        },
        {
          id: "hide-main-window",
          text: "隐藏到托盘",
          action: () => {
            void hideToTray();
          },
        },
        {
          item: "Separator",
        },
        {
          id: "quit-application",
          text: "退出应用",
          action: () => {
            void performWindowClose();
          },
        },
      ],
    });

    tray = await TrayIcon.new({
      id: "main-tray",
      tooltip: appName,
      icon: icon ?? undefined,
      menu,
      showMenuOnLeftClick: false,
      action: handleTrayAction,
    });
  })().finally(() => {
    trayPromise = null;
  });

  return trayPromise;
}

async function hideToTray() {
  try {
    await ensureTray();
  } catch (error) {
    console.error("Failed to initialize tray", error);
    message.error(`托盘初始化失败：${formatErrorMessage(error)}`);
    return;
  }

  try {
    closeModalVisible.value = false;
    await appWindow.hide();
  } catch (error) {
    console.error("Failed to hide window to tray", error);
    message.error(`隐藏到托盘失败：${formatErrorMessage(error)}`);
  }
}

async function applyCloseChoice(choice: Exclude<CloseBehavior, "ask">) {
  if (choicePending.value) {
    return;
  }

  choicePending.value = true;

  try {
    if (rememberChoice.value) {
      await appConfigStore.setCloseBehavior(choice);
    }

    if (choice === "hide-to-tray") {
      await hideToTray();
      return;
    }

    await performWindowClose();
  } finally {
    choicePending.value = false;
  }
}

async function handleCloseRequested(event: CloseRequestedEvent) {
  const behavior = preferences.value.closeBehavior;

  event.preventDefault();

  if (behavior === "close") {
    await performWindowClose();
    return;
  }

  if (behavior === "hide-to-tray") {
    await hideToTray();
    return;
  }

  rememberChoice.value = false;
  pendingChoice.value = "hide-to-tray";
  closeModalVisible.value = true;
}

function closePrompt() {
  closeModalVisible.value = false;
  rememberChoice.value = false;
}

onMounted(async () => {
  if (!isTauri()) {
    return;
  }

  try {
    await ensureTray();
  } catch (error) {
    console.error("Failed to initialize tray", error);
  }

  unlistenCloseRequested = await appWindow.onCloseRequested((event) => {
    void handleCloseRequested(event);
  });
});

onBeforeUnmount(() => {
  unlistenCloseRequested?.();
});
</script>

<template>
  <n-modal
    v-model:show="closeModalVisible"
    preset="card"
    title="关闭应用"
    class="w-[min(92vw,30rem)]"
    :mask-closable="false"
    :closable="false"
  >
    <div class="flex flex-col gap-5">
      <div>
        <div class="text-base font-semibold text-foreground">本次关闭时要执行什么操作？</div>
        <p class="mt-2 text-sm leading-6 text-muted-foreground">
          你可以只隐藏到托盘，也可以直接退出应用。托盘模式下，应用会继续在后台运行。
        </p>
      </div>

      <div class="grid gap-3">
        <button
          v-for="choice in closeChoices"
          :key="choice.value"
          type="button"
          class="flex flex-col rounded-xl border p-4 text-left transition-all duration-200"
          :class="
            pendingChoice === choice.value
              ? 'border-primary bg-primary/5 shadow-sm'
              : 'border-border/50 bg-card hover:border-primary/50'
          "
          :disabled="choicePending"
          @click="pendingChoice = choice.value"
        >
          <span class="font-semibold text-foreground">{{ choice.title }}</span>
          <span class="mt-1 text-xs leading-5 text-muted-foreground">{{ choice.description }}</span>
        </button>
      </div>

      <label class="flex cursor-pointer items-start gap-3 rounded-xl border border-border/50 bg-card/40 px-4 py-3">
        <n-checkbox v-model:checked="rememberChoice" />
        <div class="leading-5">
          <div class="text-sm font-medium text-foreground">设为默认关闭行为</div>
          <p class="mt-1 text-xs text-muted-foreground">
            保存后，设置页中的关闭策略也会同步更新。
          </p>
        </div>
      </label>
    </div>

    <template #footer>
      <div class="flex items-center justify-between gap-3">
        <n-text depth="3" class="text-xs">默认值为“每次询问”，你也可以稍后在设置页修改。</n-text>
        <div class="flex items-center gap-2">
          <n-button secondary :disabled="choicePending" @click="closePrompt">取消</n-button>
          <n-button
            type="primary"
            :loading="choicePending"
            @click="applyCloseChoice(pendingChoice)"
          >
            确认
          </n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>
