<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { NButton } from "naive-ui";
import WindowTitlebar from "@/components/window/WindowTitlebar.vue";
import AppSettingsPage from "@/pages/AppSettingsPage.vue";
import ModelSettingsPage from "@/pages/ModelSettingsPage.vue";
import {
  resolveSettingsWindowTab,
  showTranslationWindow,
  type SettingsWindowTab,
} from "@/services/window/windowManager";

const route = useRoute();
const router = useRouter();
const appWindow = getCurrentWindow();

const activeTab = ref<SettingsWindowTab>(resolveSettingsWindowTab(route.query.tab));

let unlistenNavigate: (() => void) | null = null;

watch(
  () => route.query.tab,
  (tab) => {
    activeTab.value = resolveSettingsWindowTab(tab);
  },
);

function setActiveTab(tab: SettingsWindowTab) {
  if (activeTab.value === tab && route.query.tab === tab) {
    return;
  }

  activeTab.value = tab;
  void router.replace({
    name: "settings-window",
    query: { tab },
  });
}

const navigationItems: Array<{
  value: SettingsWindowTab;
  title: string;
  description: string;
}> = [
  {
    value: "models",
    title: "模型设置",
    description: "管理模型、默认值和调用参数。",
  },
  {
    value: "app",
    title: "应用设置",
    description: "主题、快捷键、历史与关闭行为。",
  },
];

onMounted(async () => {
  unlistenNavigate = await appWindow.listen<{ tab?: SettingsWindowTab }>(
    "settings-window:navigate",
    (event) => {
      setActiveTab(resolveSettingsWindowTab(event.payload?.tab));
    },
  );
});

onBeforeUnmount(() => {
  unlistenNavigate?.();
});
</script>

<template>
  <div class="flex h-[100dvh] w-full flex-col bg-[var(--app-surface)] text-foreground transition-colors duration-300">
    <window-titlebar title="设置中心" subtitle="模型与应用偏好统一管理">
      <template #actions>
        <n-button quaternary round size="small" @click="showTranslationWindow">
          返回翻译窗
        </n-button>
      </template>
    </window-titlebar>

    <div class="flex min-h-0 flex-1 overflow-hidden">
      <aside class="hidden w-[252px] shrink-0 border-r border-border/60 bg-[var(--app-surface)] md:flex md:flex-col">
        <div class="border-b border-border/60 px-5 py-4">
          <div class="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Settings
          </div>
          <h1 class="mt-2 text-lg font-semibold text-foreground">设置中心</h1>
          <p class="mt-2 text-sm leading-6 text-muted-foreground">
            模型、主题和行为设置统一放在这里。
          </p>
        </div>

        <nav class="flex flex-1 flex-col gap-1.5 p-3">
          <button
            v-for="item in navigationItems"
            :key="item.value"
            type="button"
            class="w-full rounded-[12px] border px-4 py-3 text-left transition-colors duration-200"
            :class="
              activeTab === item.value
                ? 'border-primary/20 bg-primary/10'
                : 'border-transparent bg-transparent hover:border-border/60 hover:bg-[var(--app-surface-soft)]'
            "
            @click="setActiveTab(item.value)"
          >
            <div class="min-w-0">
              <div class="text-sm font-semibold text-foreground">{{ item.title }}</div>
              <div class="mt-1 text-xs leading-5 text-muted-foreground">
                {{ item.description }}
              </div>
            </div>
          </button>
        </nav>
      </aside>

      <section class="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--app-surface)]">
        <div class="border-b border-border/60 px-4 py-3 md:hidden">
          <div class="flex flex-wrap gap-2">
            <n-button
              v-for="item in navigationItems"
              :key="item.value"
              round
              size="small"
              secondary
              :type="activeTab === item.value ? 'primary' : 'default'"
              @click="setActiveTab(item.value)"
            >
              {{ item.title }}
            </n-button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <transition name="page-fade" mode="out-in">
            <model-settings-page v-if="activeTab === 'models'" key="models" />
            <app-settings-page v-else key="app" />
          </transition>
        </div>
      </section>
    </div>
  </div>
</template>
