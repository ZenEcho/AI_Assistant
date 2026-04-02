import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "@/App.vue";
import router from "@/router";
import { useAppConfigStore } from "@/stores/appConfig";
import { useTranslationStore } from "@/stores/translation";
import { applyThemeToDom, resolveThemeMode } from "@/utils/theme";
import "virtual:uno.css";
import "@/assets/styles/main.css";

async function bootstrap() {
  const app = createApp(App);
  const pinia = createPinia();

  app.use(pinia);

  const appConfigStore = useAppConfigStore(pinia);
  await appConfigStore.initialize();
  const translationStore = useTranslationStore(pinia);
  await translationStore.initialize();

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  applyThemeToDom({
    resolvedMode: resolveThemeMode(appConfigStore.preferences.themeMode, prefersDark),
    themeColor: appConfigStore.preferences.themeColor,
  });

  app.use(router);
  app.mount("#app");
}

void bootstrap();
