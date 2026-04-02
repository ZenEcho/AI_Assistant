<script setup lang="ts">
import { computed } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  NConfigProvider,
  NDialogProvider,
  NGlobalStyle,
  NMessageProvider,
} from "naive-ui";
import AppLifecycleController from "@/components/app/AppLifecycleController.vue";
import { useAppTheme } from "@/composables/useAppTheme";
import { MAIN_WINDOW_LABEL } from "@/services/window/windowManager";

const { naiveTheme, themeOverrides } = useAppTheme();
const isMainWindow = computed(() => getCurrentWindow().label === MAIN_WINDOW_LABEL);
</script>

<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <n-global-style />
    <n-dialog-provider>
      <n-message-provider>
        <app-lifecycle-controller v-if="isMainWindow" />
        <router-view v-slot="{ Component }">
          <transition name="page-fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </n-message-provider>
    </n-dialog-provider>
  </n-config-provider>
</template>
