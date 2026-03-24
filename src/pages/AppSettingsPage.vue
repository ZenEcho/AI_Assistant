<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { NButton, NTag, NCard, NRadio, NColorPicker, NText, NDivider, NGrid, NGridItem, NBadge, NInput, NSwitch } from "naive-ui";
import { DEFAULT_THEME_COLOR, presetThemeColors, themeModeOptions } from "@/constants/app";
import { useAppConfigStore } from "@/stores/appConfig";
import type { ThemeMode } from "@/types/app";
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
            <div
              v-for="option in themeModeOptions"
              :key="option.value"
              class="relative flex flex-col items-start p-4 border rounded-xl cursor-pointer transition-all duration-200"
              :class="preferences.themeMode === option.value ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/50 hover:border-primary/50 bg-card'"
              @click="handleThemeModeChange(option.value)"
            >
              <div class="flex items-center justify-between w-full mb-2">
                <span class="font-bold">{{ option.label }}</span>
                <div 
                  class="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors"
                  :class="preferences.themeMode === option.value ? 'border-primary' : 'border-muted-foreground'"
                >
                  <div v-if="preferences.themeMode === option.value" class="w-2 h-2 rounded-full bg-primary" />
                </div>
              </div>
              <span class="text-xs text-muted-foreground">
                {{ option.value === 'auto' ? '跟随操作系统' : `固定为${option.label}` }}
              </span>
            </div>
          </div>

          <div class="mt-6 flex items-center justify-between rounded-xl bg-primary/10 px-5 py-4 border border-primary/20">
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
            <n-color-picker
              :value="preferences.themeColor"
              :swatches="presetThemeColors"
              @update:value="handleThemeColorChange"
              class="w-full max-w-xs"
              size="large"
            />
          </div>

          <div class="grid grid-cols-4 sm:grid-cols-8 gap-3 mb-6">
            <button
              v-for="color in presetThemeColors"
              :key="color"
              :style="{ backgroundColor: color }"
              class="h-10 w-full rounded-xl border border-black/10 dark:border-white/10 transition-transform duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary shadow-sm"
              @click="handleThemeColorChange(color)"
            >
              <div v-if="preferences.themeColor === color" class="flex h-full items-center justify-center text-white mix-blend-difference">
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
                <div class="h-10 w-10 shrink-0 rounded-xl shadow-md" :style="{ backgroundColor: preferences.themeColor }" />
                <div>
                  <div class="font-bold text-sm">Accent Color</div>
                  <n-text depth="3" class="text-xs">即时响应</n-text>
                </div>
              </div>
            </div>
          </div>
        </n-card>
      </n-grid-item>

      <n-grid-item span="1 2xl:2">
        <n-card class="h-full rounded-2xl shadow-sm border-border/50 bg-card/40 backdrop-blur-md" :bordered="true">
          <template #header>
            <span class="text-xl font-bold">主题系统实时预览</span>
          </template>
          <p class="text-sm text-muted-foreground mb-6">
            在完整的全局主题系统中，主题模式与主题色共同决定了界面的每一个细节。颜色不再仅局限于按钮，而是渗透至背景层、卡片边缘环境光、悬浮效果以及选中态。
          </p>
          
          <div class="p-6 rounded-2xl border bg-[var(--app-bg)] shadow-[var(--app-shadow)]">
            <h3 class="text-lg font-bold mb-4 text-[var(--app-text)]">组件全家桶交互演示</h3>
            <n-grid :x-gap="24" :y-gap="24" cols="1 md:2 lg:3">
              <n-grid-item>
                <div class="flex flex-col gap-4">
                  <n-text class="font-semibold" depth="2">按钮层级 (Buttons)</n-text>
                  <div class="flex flex-wrap gap-2">
                    <n-button type="primary">Primary 主操作</n-button>
                    <n-button>Default 次操作</n-button>
                    <n-button type="primary" dashed>Dashed 虚线</n-button>
                    <n-button text type="primary">Text 文本</n-button>
                  </div>
                </div>
              </n-grid-item>

              <n-grid-item>
                <div class="flex flex-col gap-4">
                  <n-text class="font-semibold" depth="2">表单输入 (Inputs)</n-text>
                  <div class="flex flex-col gap-2">
                    <n-input placeholder="悬浮或点击获取焦点体验环境光" round />
                    <n-input type="password" placeholder="密码输入态" round />
                  </div>
                </div>
              </n-grid-item>

              <n-grid-item>
                <div class="flex flex-col gap-4">
                  <n-text class="font-semibold" depth="2">选择态 (Toggles & Tags)</n-text>
                  <div class="flex items-center gap-4">
                    <n-switch :value="true" />
                    <n-radio :checked="true">单选选中</n-radio>
                  </div>
                  <div class="flex items-center gap-2 mt-2">
                    <n-tag type="primary">核心提示</n-tag>
                    <n-tag type="info">信息分支</n-tag>
                    <n-badge dot type="info">
                      <n-button size="small" secondary round>Badge 徽章</n-button>
                    </n-badge>
                  </div>
                </div>
              </n-grid-item>
            </n-grid>

            <n-divider class="my-6" />
            
            <n-card class="bg-[var(--app-surface)] !border-[var(--app-border)] shadow-sm hover:!border-[var(--app-primary)] transition-colors cursor-pointer" :bordered="true">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="font-bold text-[var(--app-text)] text-lg mb-1">多层级卡片浮窗展示</h4>
                  <p class="text-sm text-[var(--app-muted)]">底层背景、表面卡片、边框氛围光晕与文本亮度严格遵守色彩规律。</p>
                </div>
                <n-button type="primary" secondary round>体验卡片氛围</n-button>
              </div>
            </n-card>
          </div>
        </n-card>
      </n-grid-item>
    </n-grid>
  </div>
</template>
