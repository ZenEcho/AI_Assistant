import { onBeforeUnmount, onMounted } from "vue";

export type WindowSurfaceMode = "default" | "overlay";

export function useWindowSurfaceMode(mode: WindowSurfaceMode) {
  onMounted(() => {
    document.documentElement.dataset.windowSurface = mode;
  });

  onBeforeUnmount(() => {
    delete document.documentElement.dataset.windowSurface;
  });
}
