import {
  defineConfig,
  presetIcons,
  presetUno,
  transformerDirectives,
  transformerVariantGroup,
} from "unocss";

export default defineConfig({
  shortcuts: {
    "app-shell": "min-h-dvh bg-[var(--app-bg)] text-[var(--app-text)]",
    "page-wrap": "mx-auto flex w-full max-w-[1100px] flex-col px-1 py-1 sm:px-2 sm:py-2",
    "panel-card":
      "overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)]/94 shadow-[var(--app-shadow)] backdrop-blur-md transition-all duration-200",
    "panel-card-elevated":
      "overflow-hidden rounded-[30px] border border-[color:rgba(var(--app-primary-rgb),0.16)] bg-[var(--app-surface-elevated)]/98 shadow-[0_20px_44px_rgba(15,23,42,0.08)] backdrop-blur-lg transition-all duration-200",
    "menu-button":
      "relative flex min-h-10 min-w-10 items-center justify-center rounded-[18px] border border-transparent bg-transparent text-[var(--app-muted)] transition-all duration-200 hover:(border-[color:rgba(var(--app-primary-rgb),0.14)] bg-[color:rgba(var(--app-primary-rgb),0.08)] text-[var(--app-text)])",
    "menu-button-active":
      "border-[color:rgba(var(--app-primary-rgb),0.18)] bg-[color:rgba(var(--app-primary-rgb),0.12)] text-[var(--app-text)]",
    "topbar-button":
      "inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-[18px] border border-[var(--app-border)] bg-[var(--app-surface-elevated)]/92 px-3 text-[var(--app-text)] transition-all duration-200 hover:(border-[color:rgba(var(--app-primary-rgb),0.18)] bg-[color:rgba(var(--app-primary-rgb),0.08)])",
    "window-button":
      "inline-flex h-10 w-10 items-center justify-center rounded-[18px] border border-[var(--app-border)] bg-[var(--app-surface-elevated)]/92 text-[var(--app-text)] transition-all duration-200 hover:(border-[color:rgba(var(--app-primary-rgb),0.18)] bg-[color:rgba(var(--app-primary-rgb),0.08)])",
    "section-title": "text-[11px] font-700 uppercase tracking-[0.22em] text-[var(--app-muted)]",
    "page-title": "text-2xl font-700 tracking-tight text-[var(--app-text)] md:text-[2.15rem]",
    "soft-text": "text-sm leading-6 text-[var(--app-muted)]",
    "label-text": "mb-2 block text-sm font-600 text-[var(--app-text)]/88",
    "field-shell":
      "rounded-[22px] border border-[var(--app-border)] bg-[var(--app-surface-elevated)]/92 px-4 py-4",
  },
  theme: {
    colors: {
      app: {
        primary: "var(--app-primary)",
        text: "var(--app-text)",
        muted: "var(--app-muted)",
      },
    },
  },
  presets: [
    presetUno(),
    presetIcons({
      scale: 1.1,
      extraProperties: {
        display: "inline-block",
        "vertical-align": "middle",
      },
    }),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
});
