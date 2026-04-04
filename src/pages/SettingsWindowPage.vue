<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { NButton } from "naive-ui";
import WindowTitlebar from "@/components/window/WindowTitlebar.vue";
import AppSettingsPage from "@/pages/AppSettingsPage.vue";
import ModelSettingsPage from "@/pages/ModelSettingsPage.vue";
import SettingsLogCenterPage from "@/pages/SettingsLogCenterPage.vue";
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
    {
      value: "logs",
      title: "日志中心",
      description: "查看、筛选、清理和导出应用日志。",
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
    <window-titlebar title="设置中心">
      <template #actions>
        <n-button quaternary round size="small" @click="showTranslationWindow">
          返回翻译窗
        </n-button>
      </template>
    </window-titlebar>

    <div class="flex min-h-0 flex-1 overflow-hidden">
      <!-- 侧边栏 -->
      <aside
        class="hidden w-[200px] shrink-0 border-r border-border/60 bg-[var(--app-surface-soft)] md:flex md:flex-col">
        <nav class="flex flex-1 flex-col gap-1 p-3">
          <button v-for="item in navigationItems" :key="item.value"
            class="w-full  px-3 py-2 text-left border-none  rounded-md" :class="activeTab === item.value
              ? 'bg-primary text-white'
              : ''" 
              
              @click="setActiveTab(item.value)"> <span class="text-[13px]">{{ item.title }}</span></button>
        </nav>
      </aside>

      <!-- 移动端顶部导航 -->
      <section class="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--app-surface)]">
        <div class="border-b border-border/60 px-4 py-2.5 md:hidden">
          <div class="flex gap-2">
            <button v-for="item in navigationItems" :key="item.value" type="button"
              class="rounded-full px-3 py-1 text-[12px] font-medium transition-colors"
              :class="activeTab === item.value ? 'bg-primary text-white' : 'bg-transparent text-muted-foreground hover:bg-[var(--app-surface-soft)]'"
              @click="setActiveTab(item.value)">
              {{ item.title }}
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <transition name="page-fade" mode="out-in">
            <model-settings-page v-if="activeTab === 'models'" key="models" />
            <app-settings-page v-else-if="activeTab === 'app'" key="app" />
            <settings-log-center-page v-else key="logs" />
          </transition>
        </div>
      </section>
    </div>
  </div>
</template>
