<script setup lang="ts">
import {
  NConfigProvider,
  NDialogProvider,
  NGlobalStyle,
  NMessageProvider,
} from "naive-ui";
import AppLifecycleController from "@/components/app/AppLifecycleController.vue";
import { useAppTheme } from "@/composables/useAppTheme";

const { naiveTheme, themeOverrides } = useAppTheme();
</script>

<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <n-global-style />
    <n-dialog-provider>
      <n-message-provider>
        <app-lifecycle-controller />
        <router-view />
      </n-message-provider>
    </n-dialog-provider>
  </n-config-provider>
</template>
