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
    description: "管理翻译模型、默认模型与供应商参数。",
  },
  {
    value: "app",
    title: "应用设置",
    description: "主题、快捷键、历史记录与关闭行为。",
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
  <div class="flex h-[100dvh] w-full flex-col bg-background text-foreground transition-colors duration-300">
    <window-titlebar title="设置中心" subtitle="模型和偏好从翻译主流程中分离">
      <template #actions>
        <n-button quaternary round size="small" @click="showTranslationWindow">
          返回翻译窗
        </n-button>
      </template>
    </window-titlebar>

    <div class="flex-1 overflow-hidden">
      <div class="mx-auto flex h-full w-full max-w-[1360px] gap-5 px-4 py-4 sm:px-6 sm:py-6">
        <aside
          class="hidden w-[248px] shrink-0 rounded-[28px] border border-border/60 bg-[var(--app-surface)] p-3 shadow-[var(--app-shadow)] md:block"
        >
          <div class="px-3 pb-3 pt-2">
            <div class="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Settings
            </div>
            <h1 class="mt-2 text-xl font-semibold text-foreground">独立配置窗口</h1>
            <p class="mt-2 text-sm leading-6 text-muted-foreground">
              翻译保持轻量，模型与应用能力集中放到这里统一管理。
            </p>
          </div>

          <div class="mt-3 grid gap-2">
            <n-button
              v-for="item in navigationItems"
              :key="item.value"
              block
              secondary
              class="!h-auto !rounded-[22px] !px-4 !py-4"
              :type="activeTab === item.value ? 'primary' : 'default'"
              @click="setActiveTab(item.value)"
            >
              <div class="w-full text-left">
                <div class="text-sm font-semibold text-foreground">{{ item.title }}</div>
                <div class="mt-1 text-xs leading-5 text-muted-foreground">
                  {{ item.description }}
                </div>
              </div>
            </n-button>
          </div>
        </aside>

        <section
          class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[32px] border border-border/60 bg-[var(--app-surface)] shadow-[var(--app-shadow)]"
        >
          <div class="border-b border-border/50 px-4 py-3 sm:px-5">
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

          <div class="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
            <transition name="page-fade" mode="out-in">
              <model-settings-page v-if="activeTab === 'models'" key="models" />
              <app-settings-page v-else key="app" />
            </transition>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
