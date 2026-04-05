<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { NSelect, type SelectOption } from "naive-ui";
import { useWindowSurfaceMode } from "@/composables/useWindowSurfaceMode";
import { createLogger } from "@/services/logging/logger";
import { useAppConfigStore } from "@/stores/appConfig";
import {
  createSystemInputTargetLanguageOverlayPayload,
  resolveSystemInputTargetLanguageLabel,
  resolveSystemInputTargetLanguageValue,
  systemInputTargetLanguageOptions,
  type SystemInputTargetLanguageOverlayPayload,
} from "@/services/systemInput/targetLanguageSwitcher";
import {
  MAIN_WINDOW_LABEL,
  SYSTEM_INPUT_TARGET_LANGUAGE_OVERLAY_CLOSED_EVENT,
  SYSTEM_INPUT_TARGET_LANGUAGE_OVERLAY_READY_EVENT,
  SYSTEM_INPUT_TARGET_LANGUAGE_OVERLAY_SYNC_EVENT,
} from "@/services/window/windowManager";

const DESTROY_DELAY_MS = 2_000;
const CURSOR_POLL_INTERVAL_MS = 200;

const appWindow = getCurrentWindow();
const appConfigStore = useAppConfigStore();
const logger = createLogger({
  source: "page",
  category: "window",
});

const activeLanguage = ref(
  resolveSystemInputTargetLanguageValue(appConfigStore.preferences.translation.targetLanguage),
);
const shortcutLabel = ref(
  createSystemInputTargetLanguageOverlayPayload(
    activeLanguage.value,
    appConfigStore.preferences.systemInput.targetLanguageSwitchShortcut,
  ).shortcutLabel,
);
const languageSelectOpen = ref(false);

const displayLabel = computed(() => resolveSystemInputTargetLanguageLabel(activeLanguage.value));
const autoModeDescription = computed(() =>
  activeLanguage.value === "auto"
    ? "自动目标会优先翻译到系统语言；如果原文本身就是系统语言，则翻译为英语。"
    : "",
);
const targetLanguageOptions = computed<SelectOption[]>(() =>
  systemInputTargetLanguageOptions.map((option) => ({
    label: option.label,
    value: option.value,
  })),
);
const targetLanguageMenuProps = {
  class: "target-language-overlay-select-menu",
} as const;
const overlayCardBackgroundStyle = {
  backgroundColor: "rgba(107, 114, 128, 0.6)",
} as const;

let cursorPollTimer: number | null = null;
let outsideWindowSince: number | null = null;
let hidden = false;
let unlistenSync: (() => void) | null = null;

useWindowSurfaceMode("overlay");

function clearCursorPollTimer() {
  if (cursorPollTimer !== null) {
    window.clearInterval(cursorPollTimer);
    cursorPollTimer = null;
  }
}

async function hideOverlayWindow() {
  if (hidden) {
    return;
  }

  hidden = true;
  clearCursorPollTimer();
  await appWindow.emitTo(MAIN_WINDOW_LABEL, SYSTEM_INPUT_TARGET_LANGUAGE_OVERLAY_CLOSED_EVENT);
  await appWindow.hide();
}

async function syncCursorPresence() {
  try {
    const [cursor, position, size] = await Promise.all([
      cursorPosition(),
      appWindow.outerPosition(),
      appWindow.outerSize(),
    ]);

    const isInsideWindow =
      cursor.x >= position.x &&
      cursor.x <= position.x + size.width &&
      cursor.y >= position.y &&
      cursor.y <= position.y + size.height;

    if (isInsideWindow) {
      outsideWindowSince = null;
      return;
    }

    const now = Date.now();

    if (outsideWindowSince === null) {
      outsideWindowSince = now;
      return;
    }

    if (now - outsideWindowSince >= DESTROY_DELAY_MS) {
      await hideOverlayWindow();
    }
  } catch (error) {
    await logger.warn("window.overlay.cursor-sync-failed", "同步快捷输入目标语言悬浮窗光标状态失败", {
      errorStack: error instanceof Error ? error.stack : String(error),
      windowLabel: appWindow.label,
    });
  }
}

function applyOverlayPayload(payload: SystemInputTargetLanguageOverlayPayload) {
  activeLanguage.value = resolveSystemInputTargetLanguageValue(payload.value);
  shortcutLabel.value = payload.shortcutLabel;
  languageSelectOpen.value = false;
  outsideWindowSince = null;
  hidden = false;
  if (cursorPollTimer === null) {
    cursorPollTimer = window.setInterval(() => {
      void syncCursorPresence();
    }, CURSOR_POLL_INTERVAL_MS);
  }
  void syncCursorPresence();
}

async function selectLanguage(value: string | null) {
  if (!value) {
    return;
  }

  if (!appConfigStore.initialized) {
    await appConfigStore.initialize();
  }

  const resolvedValue = resolveSystemInputTargetLanguageValue(value);
  activeLanguage.value = resolvedValue;
  languageSelectOpen.value = false;
  await appConfigStore.updateTranslationPreferences({
    targetLanguage: resolvedValue,
  });
  outsideWindowSince = null;
  void syncCursorPresence();
}

function handleLanguageSelectShowUpdate(value: boolean) {
  languageSelectOpen.value = value;
}

function waitForAnimationFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      resolve();
    });
  });
}

watch(
  () => appConfigStore.preferences.translation.targetLanguage,
  (value) => {
    activeLanguage.value = resolveSystemInputTargetLanguageValue(value);
    languageSelectOpen.value = false;
  },
);

onMounted(async () => {
  if (!appConfigStore.initialized) {
    await appConfigStore.initialize();
  }

  unlistenSync = await appWindow.listen<SystemInputTargetLanguageOverlayPayload>(
    SYSTEM_INPUT_TARGET_LANGUAGE_OVERLAY_SYNC_EVENT,
    (event) => {
      applyOverlayPayload(event.payload);
    },
  );

  await nextTick();
  await waitForAnimationFrame();
  await appWindow.emitTo(MAIN_WINDOW_LABEL, SYSTEM_INPUT_TARGET_LANGUAGE_OVERLAY_READY_EVENT);
  cursorPollTimer = window.setInterval(() => {
    void syncCursorPresence();
  }, CURSOR_POLL_INTERVAL_MS);
  await syncCursorPresence();
});

onBeforeUnmount(() => {
  unlistenSync?.();
  clearCursorPollTimer();
});
</script>

<template>
  <div class="flex h-[100dvh] w-full items-center justify-center bg-transparent">
    <section
      data-testid="target-language-overlay-card"
      class="relative flex h-full w-full flex-col overflow-hidden border border-white/12 px-5 py-4 text-white shadow-[0_22px_64px_rgba(15,23,42,0.34)]"
    >
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-0"
        :style="overlayCardBackgroundStyle"
      />

      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="mt-1 text-[12px] text-white/62 drop-shadow-[0_8px_20px_rgba(15,23,42,0.24)]">
            选择目标语言
          </div>
        </div>

        <div class="relative z-[2] w-[128px] shrink-0">
          <n-select
            data-testid="target-language-overlay-select"
            class="target-language-overlay-select"
            size="small"
            menu-size="tiny"
            :value="activeLanguage"
            :show="languageSelectOpen"
            :options="targetLanguageOptions"
            :menu-props="targetLanguageMenuProps"
            :to="false"
            :virtual-scroll="false"
            placement="bottom-end"
            @update:value="selectLanguage"
            @update:show="handleLanguageSelectShowUpdate"
          />
        </div>
      </div>

      <div class="relative z-[1] flex min-h-0 flex-1 items-center justify-center px-3 text-center">
        <div class="space-y-3">
          <div class="text-[12px] font-medium tracking-[0.22em] text-white/60">
            当前目标语言
          </div>
          <div
            data-testid="target-language-overlay-label"
            class="text-[32px] font-semibold tracking-[0.04em] text-white drop-shadow-[0_8px_20px_rgba(15,23,42,0.24)]"
          >
            {{ displayLabel }}
          </div>
          <div
            v-if="autoModeDescription"
            class="mx-auto max-w-[300px] text-[12px] leading-5 text-white/72"
          >
            {{ autoModeDescription }}
          </div>
        </div>
      </div>

      <div class="relative z-[1] text-center text-[12px] text-white/64">
        再按 <span class="font-semibold text-white/90">{{ shortcutLabel }}</span> 切换到下一个语言
      </div>
    </section>
  </div>
</template>

<style scoped>
:deep(.target-language-overlay-select .n-base-selection) {
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 10px 32px rgba(15, 23, 42, 0.18);
}

:deep(.target-language-overlay-select .n-base-selection:hover) {
  background: rgba(255, 255, 255, 1);
}

:deep(.target-language-overlay-select .n-base-selection-label) {
  padding-left: 16px;
  padding-right: 14px;
}

:deep(.target-language-overlay-select .n-base-selection__border),
:deep(.target-language-overlay-select .n-base-selection__state-border) {
  border-color: rgba(255, 255, 255, 0.18) !important;
  border-radius: 9999px;
}

:deep(.target-language-overlay-select .n-base-selection-input),
:deep(.target-language-overlay-select .n-base-selection-placeholder),
:deep(.target-language-overlay-select .n-base-selection-label__render-label) {
  color: rgb(51 65 85);
  font-size: 14px;
  font-weight: 500;
}

:deep(.target-language-overlay-select .n-base-selection-arrow) {
  color: rgb(100 116 139);
}

:deep(.target-language-overlay-select-menu) {
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 24px 54px rgba(15, 23, 42, 0.24);
  backdrop-filter: blur(14px);
  padding: 6px;
}

:deep(.target-language-overlay-select-menu .n-base-select-menu) {
  max-height: 164px;
}

:deep(.target-language-overlay-select-menu .n-base-select-option) {
  min-height: 40px;
  border-radius: 14px;
  color: rgb(51 65 85);
}

:deep(.target-language-overlay-select-menu .n-base-select-option--selected) {
  background: rgb(241 245 249);
  color: rgb(15 23 42);
  font-weight: 600;
}
</style>
