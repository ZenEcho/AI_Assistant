<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  MoreHorizontal,
  Languages,
  Layers,
  Settings,
  Sun,
  Moon,
  Minus,
  Copy,
  Square,
  X,
  Home,
} from "lucide-vue-next";
import { NDropdown, NIcon, NButton } from "naive-ui";
import { useAppConfigStore } from "@/stores/appConfig";
import { getMessage } from "@/utils/i18n";
import { resolveThemeMode } from "@/utils/theme";

const router = useRouter();
const route = useRoute();
const appWindow = getCurrentWindow();
const appConfigStore = useAppConfigStore();

const isMaximized = ref(false);
const prefersDark = ref(window.matchMedia("(prefers-color-scheme: dark)").matches);
const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
let unlistenResized: (() => void) | null = null;

async function runWindowAction(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    console.error("Window control action failed", error);
  }
}

const routeTitle = computed(() => {
  const locale = appConfigStore.preferences.locale;

  switch (route.name) {
    case "models":
      return getMessage(locale, "nav.models");
    case "settings":
      return getMessage(locale, "nav.settings");
    case "translate":
    default:
      return getMessage(locale, "nav.translate");
  }
});

const resolvedThemeMode = computed(() =>
  resolveThemeMode(appConfigStore.preferences.themeMode, prefersDark.value),
);

const nextThemeTooltip = computed(() =>
  resolvedThemeMode.value === "dark"
    ? getMessage(appConfigStore.preferences.locale, "topbar.themeLight")
    : getMessage(appConfigStore.preferences.locale, "topbar.themeDark"),
);

const nextLocaleLabel = computed(() =>
  appConfigStore.preferences.locale === "zh-CN" ? "Switch to English" : "切换到简体中文",
);

function renderIcon(icon: any) {
  return () => h(NIcon, null, { default: () => h(icon) });
}

const dropdownOptions = computed(() => {
  const locale = appConfigStore.preferences.locale;
  return [
    {
      label: getMessage(locale, "nav.translate"),
      key: "translate",
      icon: renderIcon(Languages),
    },
    {
      label: getMessage(locale, "nav.models"),
      key: "models",
      icon: renderIcon(Layers),
    },
    {
      label: getMessage(locale, "nav.settings"),
      key: "settings",
      icon: renderIcon(Settings),
    },
    {
      type: "divider",
      key: "d1",
    },
    {
      label: nextThemeTooltip.value,
      key: "toggle-theme",
      icon: renderIcon(resolvedThemeMode.value === "dark" ? Sun : Moon),
    },
    {
      label: nextLocaleLabel.value,
      key: "toggle-locale",
      icon: renderIcon(Languages),
    },
  ];
});

async function syncWindowState() {
  try {
    isMaximized.value = await appWindow.isMaximized();
    if (isMaximized.value) {
      document.documentElement.setAttribute("data-maximized", "");
    } else {
      document.documentElement.removeAttribute("data-maximized");
    }
  } catch (error) {
    console.error("Failed to sync window state", error);
  }
}

function syncPreferredMode(event?: MediaQueryListEvent) {
  prefersDark.value = event?.matches ?? mediaQuery.matches;
}

async function handleToggleTheme() {
  await appConfigStore.setThemeMode(resolvedThemeMode.value === "dark" ? "light" : "dark");
}

async function handleToggleMaximize() {
  await runWindowAction(async () => {
    await appWindow.toggleMaximize();
    await syncWindowState();
  });
}

async function handleTitleDblClick() {
  await handleToggleMaximize();
}

async function handleMinimize() {
  await runWindowAction(() => appWindow.minimize());
}

async function handleClose() {
  await runWindowAction(() => appWindow.close());
}

function handleTitleMouseDown() {
  void runWindowAction(() => appWindow.startDragging());
}

async function handleOverflowSelect(key: string | number) {
  switch (key) {
    case "translate":
    case "models":
    case "settings":
      await router.push({ name: String(key) });
      break;
    case "toggle-theme":
      await handleToggleTheme();
      break;
    case "toggle-locale":
      await appConfigStore.setLocale(appConfigStore.preferences.locale === "zh-CN" ? "en-US" : "zh-CN");
      break;
    default:
      break;
  }
}

onMounted(async () => {
  await syncWindowState();
  mediaQuery.addEventListener("change", syncPreferredMode);
  unlistenResized = await appWindow.onResized(() => {
    void syncWindowState();
  });
});

onBeforeUnmount(() => {
  mediaQuery.removeEventListener("change", syncPreferredMode);
  unlistenResized?.();
});
</script>

<template>
  <header
    class="relative z-30 w-full border-b border-border/30 bg-background/40 py-3 backdrop-blur-xl transition-colors duration-300">
    <div class="flex h-full w-full items-center justify-between gap-3 px-3 sm:px-5">
      <div class="flex min-w-0 flex-1 items-center gap-3" @mousedown.left="handleTitleMouseDown"
        @dblclick="handleTitleDblClick">
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-primary/10 text-sm font-bold tracking-[0.18em] text-primary pointer-events-none">
          AI
        </div>

        <div class="min-w-0 pointer-events-none">
          <p class="truncate text-[15px] font-bold text-foreground">
            {{ getMessage(appConfigStore.preferences.locale, "appName") }}
          </p>
          <p class="truncate text-xs text-muted-foreground">
            {{ routeTitle }}
          </p>
        </div>
      </div>

      <div class="shrink-0 flex items-center gap-2">

        <n-button quaternary circle size="small" @click="router.push({ name: 'translate' })">
          <!-- 翻译页 -->
          <template #icon>
            <NIcon>
              <Home />
            </NIcon>
          </template>
        </n-button>
        <n-button quaternary circle size="small" @click="router.push({ name: 'models' })">
          <!-- 模型页 -->
          <template #icon>
            <NIcon>
              <Layers />
            </NIcon>
          </template>
        </n-button>

        <n-dropdown trigger="click" :options="dropdownOptions" @select="handleOverflowSelect">
          <n-button quaternary circle size="small" :focusable="false">
            <template #icon>
              <NIcon>
                <MoreHorizontal />
              </NIcon>
            </template>
          </n-button>
        </n-dropdown>

        <div class="mx-1 hidden h-6 w-px bg-border/50 md:block" />

        <n-button quaternary circle size="small" @click.stop="handleMinimize"
          :title="getMessage(appConfigStore.preferences.locale, 'topbar.minimize')">
          <template #icon>
            <NIcon>
              <Minus />
            </NIcon>
          </template>
        </n-button>

        <n-button quaternary circle size="small" @click.stop="handleToggleMaximize"
          :title="getMessage(appConfigStore.preferences.locale, isMaximized ? 'topbar.restore' : 'topbar.maximize')">
          <template #icon>
            <NIcon>
              <component :is="isMaximized ? Copy : Square" />
            </NIcon>
          </template>
        </n-button>

        <n-button quaternary circle size="small" type="error" @click.stop="handleClose"
          :title="getMessage(appConfigStore.preferences.locale, 'topbar.close')">
          <template #icon>
            <NIcon>
              <X />
            </NIcon>
          </template>
        </n-button>
      </div>
    </div>
  </header>
</template>
