import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";
import AppLayout from "@/layouts/AppLayout.vue";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    component: AppLayout,
    children: [
      {
        path: "",
        name: "translate",
        component: () => import("@/pages/TranslatePage.vue"),
      },
      {
        path: "models",
        name: "models",
        component: () => import("@/pages/ModelSettingsPage.vue"),
      },
      {
        path: "settings",
        name: "settings",
        component: () => import("@/pages/AppSettingsPage.vue"),
      },
    ],
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

export default router;
