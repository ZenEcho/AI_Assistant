<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { NButton, NTag, NCard, NColorPicker, NText, NGrid, NGridItem } from "naive-ui";
import { closeBehaviorOptions, DEFAULT_THEME_COLOR, presetThemeColors, themeModeOptions } from "@/constants/app";
import { useAppConfigStore } from "@/stores/appConfig";
import type { CloseBehavior, ThemeMode } from "@/types/app";
import { resolveThemeMode } from "@/utils/theme";

const appConfigStore = useAppConfigStore();
const { preferences } = storeToRefs(appConfigStore);

const currentThemeModeLabel = computed(() => {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolvedMode = resolveThemeMode(preferences.value.themeMode, prefersDark);

  return resolvedMode === "dark" ? "深色" : "浅色";
});

async function handleThemeModeChange(value: ThemeMode) {
  await appConfigStore.setThemeMode(value);
}

async function handleThemeColorChange(value: string) {
  await appConfigStore.setThemeColor(value);
}

async function handleCloseBehaviorChange(value: CloseBehavior) {
  await appConfigStore.setCloseBehavior(value);
}

async function handleResetAppearance() {
  await appConfigStore.resetPreferences();
}
</script>

<template>
  <div class="h-full flex flex-col gap-6 animate-in fade-in duration-300">
    <!-- Header -->
    <div class="flex flex-col gap-4 border-b border-border/50 pb-5 md:flex-row md:items-start md:justify-between">
      <div>
        <n-text depth="3" class="text-xs tracking-wider uppercase font-semibold">App Settings</n-text>
        <h1 class="mt-2 text-3xl font-bold tracking-tight text-foreground md:text-4xl">应用设置</h1>
        <p class="mt-2 text-sm text-muted-foreground max-w-2xl leading-relaxed">
          管理主题模式、主题色和界面外观，让翻译窗口保持轻量、清晰和低干扰。
        </p>
      </div>
      <div class="shrink-0">
        <n-button secondary @click="handleResetAppearance">恢复默认</n-button>
      </div>
    </div>


    <!-- Content -->
    <n-grid :x-gap="24" :y-gap="24" cols="1 2xl:2">
      <!-- Theme Mode -->
      <n-grid-item>
        <n-card class="h-full rounded-2xl shadow-sm border-border/50 bg-card/40 backdrop-blur-md" :bordered="true">
          <template #header>
            <div class="flex items-center gap-2">
              <span class="text-xl font-bold">主题模式</span>
              <n-tag size="small" type="info" round class="ml-2">Light / Dark / Auto</n-tag>
            </div>
          </template>
          <p class="text-sm text-muted-foreground mb-6">
            默认值为 Auto，会跟随系统主题切换。切换结果会同步影响页面壳层、输入框、按钮和右侧导航高亮。
          </p>

          <div class="grid gap-4 sm:grid-cols-3">
            <div v-for="option in themeModeOptions" :key="option.value"
              class="relative flex flex-col items-start p-4 border rounded-xl cursor-pointer transition-all duration-200"
              :class="preferences.themeMode === option.value ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/50 hover:border-primary/50 bg-card'"
              @click="handleThemeModeChange(option.value)">
              <div class="flex items-center justify-between w-full mb-2">
                <span class="font-bold">{{ option.label }}</span>
                <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors"
                  :class="preferences.themeMode === option.value ? 'border-primary' : 'border-muted-foreground'">
                  <div v-if="preferences.themeMode === option.value" class="w-2 h-2 rounded-full bg-primary" />
                </div>
              </div>
              <span class="text-xs text-muted-foreground">
                {{ option.value === 'auto' ? '跟随操作系统' : `固定为${option.label}` }}
              </span>
            </div>
          </div>

          <div
            class="mt-6 flex items-center justify-between rounded-xl bg-primary/10 px-5 py-4 border border-primary/20">
            <div>
              <div class="font-bold">当前生效：{{ currentThemeModeLabel }}</div>
            </div>
            <n-tag type="primary" size="small" :bordered="false">配置: {{ preferences.themeMode }}</n-tag>
          </div>
        </n-card>
      </n-grid-item>

      <!-- Theme Color -->
      <n-grid-item>
        <n-card class="h-full rounded-2xl shadow-sm border-border/50 bg-card/40 backdrop-blur-md" :bordered="true">
          <template #header>
            <div class="flex items-center gap-2">
              <span class="text-xl font-bold">主题色</span>
            </div>
          </template>
          <p class="text-sm text-muted-foreground mb-6">
            主题色会驱动按钮主态、输入焦点、菜单高亮和页面背景中的环境光。
          </p>

          <div class="flex items-center gap-4 mb-6">
            <n-color-picker :value="preferences.themeColor" :swatches="presetThemeColors"
              @update:value="handleThemeColorChange" class="w-full max-w-xs" size="large" />
          </div>

          <div class="grid grid-cols-4 sm:grid-cols-8 gap-3 mb-6">
            <button v-for="color in presetThemeColors" :key="color" :style="{ backgroundColor: color }"
              class="h-10 w-full rounded-xl border border-black/10 dark:border-white/10 transition-transform duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary shadow-sm"
              @click="handleThemeColorChange(color)">
              <div v-if="preferences.themeColor === color"
                class="flex h-full items-center justify-center text-white mix-blend-difference">
                ✓
              </div>
            </button>
          </div>

          <div class="grid sm:grid-cols-2 gap-4">
            <div class="rounded-xl border border-border/50 p-4 bg-card/50">
              <n-text depth="3" class="text-xs font-semibold uppercase">当前选择</n-text>
              <div class="mt-2 text-lg font-bold">{{ preferences.themeColor }}</div>
              <n-text depth="3" class="text-xs mt-1 block">默认值: {{ DEFAULT_THEME_COLOR }}</n-text>
            </div>

            <div class="rounded-xl border border-primary/20 bg-primary/10 p-4">
              <div class="flex items-center gap-3">
                <div class="h-10 w-10 shrink-0 rounded-xl shadow-md"
                  :style="{ backgroundColor: preferences.themeColor }" />
                <div>
                  <div class="font-bold text-sm">Accent Color</div>
                  <n-text depth="3" class="text-xs">即时响应</n-text>
                </div>
              </div>
            </div>
          </div>
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card class="h-full rounded-2xl shadow-sm border-border/50 bg-card/40 backdrop-blur-md" :bordered="true">
          <template #header>
            <div class="flex items-center gap-2">
              <span class="text-xl font-bold">关闭行为</span>
              <n-tag size="small" type="warning" round class="ml-2">Tray</n-tag>
            </div>
          </template>
          <p class="text-sm text-muted-foreground mb-6">
            你可以让关闭按钮每次询问，也可以固定为“隐藏到托盘”或“直接退出”。选择会立即保存到本地。
          </p>

          <div class="grid gap-4">
            <div v-for="option in closeBehaviorOptions" :key="option.value"
              class="relative flex cursor-pointer flex-col rounded-xl border p-4 transition-all duration-200" :class="preferences.closeBehavior === option.value
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border/50 bg-card hover:border-primary/50'
                " @click="handleCloseBehaviorChange(option.value)">
              <div class="mb-2 flex items-center justify-between gap-3">
                <span class="font-bold">{{ option.label }}</span>
                <div class="flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors"
                  :class="preferences.closeBehavior === option.value ? 'border-primary' : 'border-muted-foreground'">
                  <div v-if="preferences.closeBehavior === option.value" class="h-2 w-2 rounded-full bg-primary" />
                </div>
              </div>
              <span class="text-xs leading-5 text-muted-foreground">
                {{ option.description }}
              </span>
            </div>
          </div>

          <div class="mt-6 rounded-xl border border-primary/20 bg-primary/10 px-5 py-4">
            <div class="font-bold">
              当前默认：{{
                closeBehaviorOptions.find((option) => option.value === preferences.closeBehavior)?.label
              }}
            </div>
            <p class="mt-1 text-xs leading-5 text-muted-foreground">
              如果你选择“每次询问”，关闭时会弹出确认框；如果选择固定行为，将直接执行。
            </p>
          </div>
        </n-card>
      </n-grid-item>
    </n-grid>
  </div>
</template>
