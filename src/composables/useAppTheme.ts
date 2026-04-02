import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { darkTheme, type GlobalTheme } from "naive-ui";
import { useAppConfigStore } from "@/stores/appConfig";
import { applyThemeToDom, createNaiveThemeOverrides, resolveThemeMode } from "@/utils/theme";

export function useAppTheme() {
  const appConfigStore = useAppConfigStore();
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const prefersDark = ref(mediaQuery.matches);

  const syncPreferredMode = (event?: MediaQueryListEvent) => {
    prefersDark.value = event?.matches ?? mediaQuery.matches;
  };

  onMounted(() => {
    mediaQuery.addEventListener("change", syncPreferredMode);
  });

  onBeforeUnmount(() => {
    mediaQuery.removeEventListener("change", syncPreferredMode);
  });

  const resolvedMode = computed(() =>
    resolveThemeMode(appConfigStore.preferences.themeMode, prefersDark.value),
  );
  const isDark = computed(() => resolvedMode.value === "dark");
  const naiveTheme = computed<GlobalTheme | null>(() => (isDark.value ? darkTheme : null));
  const themeOverrides = computed(() =>
    createNaiveThemeOverrides(isDark.value),
  );

  watch(
    resolvedMode,
    (mode) => {
      applyThemeToDom({
        resolvedMode: mode,
      });
    },
    { immediate: true },
  );

  return {
    resolvedMode,
    isDark,
    naiveTheme,
    themeOverrides,
  };
}
