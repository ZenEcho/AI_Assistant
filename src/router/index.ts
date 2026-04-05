import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "translate",
    component: () => import("@/pages/TranslatePage.vue"),
  },
  {
    path: "/translate-result",
    name: "translate-result",
    component: () => import("@/pages/TranslateResultPage.vue"),
  },
  {
    path: "/system-input-target-language-overlay",
    name: "system-input-target-language-overlay",
    component: () => import("@/pages/SystemInputTargetLanguageOverlayPage.vue"),
  },
  {
    path: "/settings-window",
    name: "settings-window",
    component: () => import("@/pages/SettingsWindowPage.vue"),
  },
  {
    path: "/models",
    redirect: {
      name: "settings-window",
      query: {
        tab: "models",
      },
    },
  },
  {
    path: "/settings",
    redirect: {
      name: "settings-window",
      query: {
        tab: "app",
      },
    },
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

export default router;
