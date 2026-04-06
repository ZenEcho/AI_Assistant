<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { defaultWindowIcon, getName } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Image } from "@tauri-apps/api/image";
import { Menu } from "@tauri-apps/api/menu";
import { TrayIcon, type TrayIconEvent } from "@tauri-apps/api/tray";
import { CloseRequestedEvent, getCurrentWindow } from "@tauri-apps/api/window";
import { NButton, NCheckbox, NModal, NRadio, NText, useMessage } from "naive-ui";
import { useAppConfigStore } from "@/stores/appConfig";
import { useSystemInputStore } from "@/stores/systemInput";
import { createLogger } from "@/services/logging/logger";
import {
  registerGlobalShortcut,
  registerNamedShortcut,
  unregisterAllShortcuts,
} from "@/services/shortcut/globalShortcutService";
import {
  hideCurrentWindowToTray,
  prewarmSystemInputTargetLanguageOverlayWindow,
} from "@/services/window/windowManager";
import type { CloseBehavior } from "@/types/app";

const appConfigStore = useAppConfigStore();
const systemInputStore = useSystemInputStore();
const logger = createLogger({
  source: "page",
  category: "app",
});
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
let appIconPromise: Promise<Image | null> | null = null;
let shortcutsReady = false;

const systemInputShortcutDefinitions = [
  {
    id: "system-input-target-language-overlay",
    field: "targetLanguageSwitchShortcut",
    run: async () => {
      await systemInputStore.previewOrCycleTargetLanguageFromShortcut();
    },
  },
  {
    id: "system-input-translate-selection",
    field: "translateSelectionShortcut",
    run: async () => {
      await systemInputStore.translateSelectedTextFromShortcut();
    },
  },
  {
    id: "system-input-translate-clipboard",
    field: "translateClipboardShortcut",
    run: async () => {
      await systemInputStore.translateClipboardTextFromShortcut();
    },
  },
  {
    id: "system-input-paste-last-translation",
    field: "pasteLastTranslationShortcut",
    run: async () => {
      await systemInputStore.pasteLastTranslationFromShortcut();
    },
  },
  {
    id: "system-input-toggle-enabled",
    field: "toggleEnabledShortcut",
    run: async () => {
      await systemInputStore.toggleEnabledFromShortcut();
    },
  },
] as const;

function formatErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "未知错误";
}

async function loadAppIcon() {
  if (appIconPromise) {
    return appIconPromise;
  }

  appIconPromise = (async () => {
    try {
      const response = await fetch("/logo.png");

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await Image.fromBytes(await response.arrayBuffer());
    } catch (error) {
      void logger.warn("app.icon.load-failed", "运行时图标加载失败，已回退默认图标", {
        errorStack: error instanceof Error ? error.stack : String(error),
      });
      return await defaultWindowIcon();
    }
  })();

  return appIconPromise;
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
    void logger.error("app.exit.failed", "退出应用失败", {
      errorStack: error instanceof Error ? error.stack : String(error),
    });
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
    const icon = await loadAppIcon();
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
    void logger.error("app.tray.init-failed", "托盘初始化失败", {
      errorStack: error instanceof Error ? error.stack : String(error),
    });
    message.error(`托盘初始化失败：${formatErrorMessage(error)}`);
    return;
  }

  try {
    closeModalVisible.value = false;
    await hideCurrentWindowToTray();
  } catch (error) {
    void logger.error("window.main.hide-to-tray.failed", "隐藏到托盘失败", {
      category: "window",
      errorStack: error instanceof Error ? error.stack : String(error),
    });
    message.error(`隐藏到托盘失败：${formatErrorMessage(error)}`);
  }
}

async function applyWindowIcon() {
  try {
    const icon = await loadAppIcon();

    if (!icon) {
      return;
    }

    await appWindow.setIcon(icon);
  } catch (error) {
    void logger.warn("app.window-icon.apply-failed", "窗口图标设置失败", {
      errorStack: error instanceof Error ? error.stack : String(error),
    });
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

async function registerSystemInputActionShortcuts() {
  const shortcutValues = preferences.value.systemInput;
  const results = await Promise.all(
    systemInputShortcutDefinitions.map(({ id, field, run }) =>
      registerNamedShortcut(id, shortcutValues[field], run),
    ),
  );

  results.forEach((result, index) => {
    if (result.success) {
      return;
    }

    const shortcut = shortcutValues[systemInputShortcutDefinitions[index].field];
    void logger.warn("shortcut.system-input.register-failed", "系统输入快捷键注册失败", {
      category: "shortcut",
      detail: {
        shortcut,
        error: result.error,
      },
    });
  });
}

onMounted(async () => {
  if (!isTauri()) {
    return;
  }

  await applyWindowIcon();

  try {
    await ensureTray();
  } catch (error) {
    void logger.error("app.tray.init-failed", "应用启动时托盘初始化失败", {
      errorStack: error instanceof Error ? error.stack : String(error),
    });
  }

  try {
    await systemInputStore.initialize();
  } catch (error) {
    void logger.error("system-input.initialize.failed", "系统输入 Store 初始化失败", {
      category: "external-input",
      errorStack: error instanceof Error ? error.stack : String(error),
    });
  }

  try {
    await prewarmSystemInputTargetLanguageOverlayWindow();
  } catch (error) {
    void logger.warn("window.overlay.prewarm-failed", "目标语言悬浮窗预热失败", {
      category: "window",
      errorStack: error instanceof Error ? error.stack : String(error),
    });
  }

  // Register global shortcut for window activation
  const shortcut = preferences.value.globalShortcut;

  if (shortcut) {
    const result = await registerGlobalShortcut(shortcut);

    if (!result.success) {
      void logger.warn("shortcut.global.register-failed", "全局快捷键注册失败", {
        category: "shortcut",
        detail: {
          shortcut,
          error: result.error,
        },
      });
    }
  }

  await registerSystemInputActionShortcuts();
  shortcutsReady = true;

  unlistenCloseRequested = await appWindow.onCloseRequested((event) => {
    void handleCloseRequested(event);
  });
});

watch(
  () => [
    preferences.value.systemInput.translateSelectionShortcut,
    preferences.value.systemInput.translateClipboardShortcut,
    preferences.value.systemInput.pasteLastTranslationShortcut,
    preferences.value.systemInput.toggleEnabledShortcut,
    preferences.value.systemInput.targetLanguageSwitchShortcut,
  ],
  () => {
    if (!isTauri() || !shortcutsReady) {
      return;
    }

    void registerSystemInputActionShortcuts();
  },
);

onBeforeUnmount(async () => {
  unlistenCloseRequested?.();
  systemInputStore.dispose();
  await unregisterAllShortcuts();
});
</script>

<template>
  <n-modal v-model:show="closeModalVisible" preset="card" title="关闭应用" class="w-[min(92vw,30rem)]"
    :mask-closable="false" :closable="false">
    <div class="flex flex-col gap-5">
      <div>
        <div class="text-base font-semibold text-foreground">本次关闭时要执行什么操作？</div>
      </div>

      <div class="flex flex-row gap-3">
        <div v-for="choice in closeChoices" :key="choice.value" role="button" tabindex="0"
          class=" flex flex-row w-full rounded-xl border p-4 text-left transition-all duration-200 " :class="pendingChoice === choice.value
            ? 'border-primary bg-primary/5 shadow-sm'
            : 'border-border/50 bg-card hover:border-primary/50'
            " @click="pendingChoice = choice.value" @keydown.enter.prevent="pendingChoice = choice.value"
          @keydown.space.prevent="pendingChoice = choice.value">
          <div class="flex flex-row justify-between w-full gap-3">
            <div class="min-w-0">
              <div class="font-semibold text-foreground">{{ choice.title }}</div>
            </div>

            <div> <n-radio :checked="pendingChoice === choice.value" :disabled="choicePending" /></div>
          </div>
        </div>
      </div>


      <n-checkbox class="flex cursor-pointer items-start rounded-xl border border-border/50 bg-card/40 px-4 py-3"
        v-model:checked="rememberChoice">
        <div class="text-sm font-medium text-foreground leading-5">设为默认关闭行为</div>
      </n-checkbox>

    </div>

    <template #footer>
      <div class="flex items-center justify-between gap-3">
        <n-text depth="3" class="text-xs">默认值为“每次询问”，你也可以稍后在设置页修改。</n-text>
        <div class="flex items-center gap-2">
          <n-button secondary :disabled="choicePending" @click="closePrompt">取消</n-button>
          <n-button type="primary" :loading="choicePending" @click="applyCloseChoice(pendingChoice)">
            确认
          </n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>
