import type { GlobalThemeOverrides } from "naive-ui";
import type { ResolvedThemeMode, ThemeMode } from "@/types/app";
import { mixColors, normalizeHex, shiftColor, toRgbCss, toHslCss } from "@/utils/color";

export function resolveThemeMode(themeMode: ThemeMode, prefersDark: boolean): ResolvedThemeMode {
  if (themeMode === "auto") {
    return prefersDark ? "dark" : "light";
  }

  return themeMode;
}

export function getThemeTokens(themeColor: string, isDark: boolean) {
  const primaryColor = normalizeHex(themeColor);

  return {
    primary: primaryColor,
    primaryRgb: toRgbCss(primaryColor),
    primaryHover: isDark ? shiftColor(primaryColor, 0.12) : shiftColor(primaryColor, -0.06),
    primaryPressed: isDark ? shiftColor(primaryColor, -0.12) : shiftColor(primaryColor, -0.14),
    bg: isDark ? mixColors(primaryColor, "#08080a", 0.93) : mixColors(primaryColor, "#f5f6f8", 0.93),
    surface: isDark ? mixColors(primaryColor, "#121316", 0.9) : mixColors(primaryColor, "#ffffff", 0.9),
    surfaceElevated: isDark ? mixColors(primaryColor, "#1a1b1f", 0.88) : mixColors(primaryColor, "#fcfdfd", 0.9),
    popover: isDark ? mixColors(primaryColor, "#16171b", 0.9) : "#ffffff",
    text: isDark ? mixColors(primaryColor, "#f3f4f6", 0.85) : mixColors(primaryColor, "#111827", 0.85),
    textMuted: isDark ? mixColors(primaryColor, "#9ca3af", 0.85) : mixColors(primaryColor, "#4b5563", 0.85),
    border: isDark ? mixColors(primaryColor, "#27272a", 0.75) : mixColors(primaryColor, "#e4e4e7", 0.75),
    borderHover: isDark ? mixColors(primaryColor, "#3f3f46", 0.7) : mixColors(primaryColor, "#d4d4d8", 0.7),
    input: isDark ? mixColors(primaryColor, "#131418", 0.85) : mixColors(primaryColor, "#ffffff", 0.85),
  };
}

export function applyThemeToDom(options: {
  resolvedMode: ResolvedThemeMode;
  themeColor: string;
}): void {
  const isDark = options.resolvedMode === "dark";
  const tokens = getThemeTokens(options.themeColor, isDark);

  document.documentElement.dataset.theme = options.resolvedMode;

  // Primary Action Color
  document.documentElement.style.setProperty("--app-primary", tokens.primary);
  document.documentElement.style.setProperty("--app-primary-rgb", tokens.primaryRgb);

  // Background and Surfaces
  document.documentElement.style.setProperty("--app-bg", tokens.bg);
  document.documentElement.style.setProperty("--app-surface", tokens.surface);
  document.documentElement.style.setProperty("--app-surface-elevated", tokens.surfaceElevated);
  
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
  document.documentElement.style.setProperty("--secondary", toHslCss(tokens.bg));
  document.documentElement.style.setProperty("--secondary-foreground", toHslCss(tokens.text));
  document.documentElement.style.setProperty("--muted", toHslCss(tokens.surfaceElevated));
  document.documentElement.style.setProperty("--muted-foreground", toHslCss(tokens.textMuted));
  document.documentElement.style.setProperty("--accent", toHslCss(tokens.primaryHover));
  document.documentElement.style.setProperty("--accent-foreground", toHslCss(tokens.text));
  document.documentElement.style.setProperty("--border", toHslCss(tokens.border));
  document.documentElement.style.setProperty("--input", toHslCss(tokens.border));
  document.documentElement.style.setProperty("--ring", toHslCss(tokens.primary));
}

export function createNaiveThemeOverrides(
  themeColor: string,
  isDark: boolean,
): GlobalThemeOverrides {
  const t = getThemeTokens(themeColor, isDark);

  return {
    common: {
      primaryColor: t.primary,
      primaryColorHover: t.primaryHover,
      primaryColorPressed: t.primaryPressed,
      primaryColorSuppl: t.primaryHover,
      bodyColor: t.bg,
      cardColor: t.surface,
      modalColor: t.surfaceElevated,
      popoverColor: t.popover,
      tableColor: t.surface,
      tableHeaderColor: isDark ? shiftColor(t.surface, -0.05) : shiftColor(t.surface, -0.02),
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
      borderRadius: "18px",
      borderRadiusSmall: "14px",
    },
    Card: {
      color: t.surface,
      borderColor: t.border,
      borderRadius: "26px",
    },
    Input: {
      color: t.input,
      colorFocus: t.input,
      border: `1px solid ${t.border}`,
      borderHover: `1px solid ${t.primaryHover}`,
      borderFocus: `1px solid ${t.primary}`,
      borderRadius: "18px",
      boxShadowFocus: `0 0 0 3px rgba(${t.primaryRgb}, 0.14)`,
    },
    Select: {
      peers: {
        InternalSelection: {
          color: t.input,
          border: `1px solid ${t.border}`,
          borderHover: `1px solid ${t.primaryHover}`,
          borderFocus: `1px solid ${t.primary}`,
          borderRadius: "18px",
          boxShadowFocus: `0 0 0 3px rgba(${t.primaryRgb}, 0.14)`,
        },
      },
    },
    Button: {
      borderRadiusSmall: "14px",
      borderRadiusMedium: "16px",
      borderRadiusLarge: "18px",
      colorFocus: t.surface,
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
