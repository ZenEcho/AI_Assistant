import type { GlobalThemeOverrides } from "naive-ui";
import type { ResolvedThemeMode, ThemeMode } from "@/types/app";
import { shiftColor, toRgbCss, toHslCss } from "@/utils/color";

export function resolveThemeMode(themeMode: ThemeMode, prefersDark: boolean): ResolvedThemeMode {
  if (themeMode === "auto") {
    return prefersDark ? "dark" : "light";
  }

  return themeMode;
}

const PRIMARY_COLOR = "#3b82f6";

export function getThemeTokens(isDark: boolean) {
  const primaryColor = PRIMARY_COLOR;
  const surfaceBase = isDark
    ? {
        bg: "#111318",
        surface: "#111318",
        surfaceElevated: "#171b22",
        surfaceSoft: "#1d232d",
        popover: "#171b22",
        text: "#e5e7eb",
        textMuted: "#94a3b8",
        border: "#2a3140",
        borderHover: "#3a4457",
        input: "#171b22",
        shadow: "0 10px 30px rgba(0, 0, 0, 0.24)",
      }
    : {
        bg: "#f3f5f7",
        surface: "#f3f5f7",
        surfaceElevated: "#ffffff",
        surfaceSoft: "#edf1f5",
        popover: "#ffffff",
        text: "#0f172a",
        textMuted: "#64748b",
        border: "#dbe2ea",
        borderHover: "#c7d0db",
        input: "#ffffff",
        shadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
      };

  return {
    primary: primaryColor,
    primaryRgb: toRgbCss(primaryColor),
    primaryHover: isDark ? shiftColor(primaryColor, 0.12) : shiftColor(primaryColor, -0.06),
    primaryPressed: isDark ? shiftColor(primaryColor, -0.12) : shiftColor(primaryColor, -0.14),
    ...surfaceBase,
  };
}

export function applyThemeToDom(options: {
  resolvedMode: ResolvedThemeMode;
}): void {
  const isDark = options.resolvedMode === "dark";
  const tokens = getThemeTokens(isDark);

  document.documentElement.dataset.theme = options.resolvedMode;

  // Primary Action Color
  document.documentElement.style.setProperty("--app-primary", tokens.primary);
  document.documentElement.style.setProperty("--app-primary-rgb", tokens.primaryRgb);

  // Background and Surfaces
  document.documentElement.style.setProperty("--app-bg", tokens.bg);
  document.documentElement.style.setProperty("--app-surface", tokens.surface);
  document.documentElement.style.setProperty("--app-surface-elevated", tokens.surfaceElevated);
  document.documentElement.style.setProperty("--app-surface-soft", tokens.surfaceSoft);
  document.documentElement.style.setProperty("--app-shadow", tokens.shadow);
  
  // Text & Content Layers
  document.documentElement.style.setProperty("--app-text", tokens.text);
  document.documentElement.style.setProperty("--app-muted", tokens.textMuted);
  
  // Controls & Dividers
  document.documentElement.style.setProperty("--app-border", tokens.border);
  document.documentElement.style.setProperty("--app-border-hover", tokens.borderHover);

  // Shadcn internal HSL overrides
  document.documentElement.style.setProperty("--background", toHslCss(tokens.bg));
  document.documentElement.style.setProperty("--foreground", toHslCss(tokens.text));
  document.documentElement.style.setProperty("--card", toHslCss(tokens.surface));
  document.documentElement.style.setProperty("--card-foreground", toHslCss(tokens.text));
  document.documentElement.style.setProperty("--popover", toHslCss(tokens.surfaceElevated));
  document.documentElement.style.setProperty("--popover-foreground", toHslCss(tokens.text));
  document.documentElement.style.setProperty("--primary", toHslCss(tokens.primary));
  document.documentElement.style.setProperty("--secondary", toHslCss(tokens.surfaceSoft));
  document.documentElement.style.setProperty("--secondary-foreground", toHslCss(tokens.text));
  document.documentElement.style.setProperty("--muted", toHslCss(tokens.surfaceSoft));
  document.documentElement.style.setProperty("--muted-foreground", toHslCss(tokens.textMuted));
  document.documentElement.style.setProperty("--accent", toHslCss(tokens.primaryHover));
  document.documentElement.style.setProperty("--accent-foreground", toHslCss(tokens.text));
  document.documentElement.style.setProperty("--border", toHslCss(tokens.border));
  document.documentElement.style.setProperty("--input", toHslCss(tokens.border));
  document.documentElement.style.setProperty("--ring", toHslCss(tokens.primary));
}

export function createNaiveThemeOverrides(
  isDark: boolean,
): GlobalThemeOverrides {
  const t = getThemeTokens(isDark);

  return {
    common: {
      primaryColor: t.primary,
      primaryColorHover: t.primaryHover,
      primaryColorPressed: t.primaryPressed,
      primaryColorSuppl: t.primaryHover,
      bodyColor: t.surface,
      cardColor: t.surfaceElevated,
      modalColor: t.surfaceElevated,
      popoverColor: t.popover,
      tableColor: t.surfaceElevated,
      tableHeaderColor: isDark ? shiftColor(t.surfaceSoft, -0.02) : shiftColor(t.surfaceSoft, -0.01),
      borderColor: t.border,
      dividerColor: t.border,
      textColorBase: t.text,
      textColor1: t.text,
      textColor2: t.textMuted,
      textColor3: isDark ? shiftColor(t.textMuted, -0.2) : shiftColor(t.textMuted, 0.2),
      placeholderColor: t.textMuted,
      inputColor: t.input,
      actionColor: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)",
      closeIconColor: t.textMuted,
      closeIconColorHover: t.text,
      borderRadius: "14px",
      borderRadiusSmall: "10px",
    },
    Card: {
      color: t.surfaceElevated,
      borderColor: t.border,
      borderRadius: "16px",
    },
    Input: {
      color: t.input,
      colorFocus: t.input,
      border: `1px solid ${t.border}`,
      borderHover: `1px solid ${t.primaryHover}`,
      borderFocus: `1px solid ${t.primary}`,
      borderRadius: "12px",
      boxShadowFocus: `0 0 0 3px rgba(${t.primaryRgb}, 0.14)`,
    },
    Select: {
      peers: {
        InternalSelection: {
          color: t.input,
          border: `1px solid ${t.border}`,
          borderHover: `1px solid ${t.primaryHover}`,
          borderFocus: `1px solid ${t.primary}`,
          borderRadius: "12px",
          boxShadowFocus: `0 0 0 3px rgba(${t.primaryRgb}, 0.14)`,
        },
      },
    },
    Button: {
      borderRadiusSmall: "10px",
      borderRadiusMedium: "12px",
      borderRadiusLarge: "12px",
      colorFocus: t.surfaceElevated,
      textColorGhostFocus: t.primary,
    },
    Switch: {
      railColorActive: t.primary,
      buttonColor: "#ffffff",
    },
    Slider: {
      fillColor: t.primary,
      fillColorHover: t.primaryHover,
      dotColor: t.primary,
      dotColorActive: t.primaryPressed,
    },
    Radio: {
      dotColorActive: t.primary,
      buttonColorActive: t.primary,
      buttonTextColorActive: "#ffffff",
    },
    Checkbox: {
      colorChecked: t.primary,
      borderChecked: `1px solid ${t.primary}`,
    },
    Layout: {
      color: "transparent",
      siderColor: "transparent",
    },
  };
}
