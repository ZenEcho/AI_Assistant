import type { GlobalThemeOverrides } from "naive-ui";
import type { ResolvedThemeMode, ThemeMode } from "@/types/app";
import { DEFAULT_THEME_COLOR } from "@/constants/app";
import { normalizeHex, shiftColor, toRgbCss, toHslCss } from "@/utils/color";

export function resolveThemeMode(themeMode: ThemeMode, prefersDark: boolean): ResolvedThemeMode {
  if (themeMode === "auto") {
    return prefersDark ? "dark" : "light";
  }

  return themeMode;
}

export function getThemeTokens(isDark: boolean, themeColor = DEFAULT_THEME_COLOR) {
  const primaryColor = normalizeHex(themeColor);
  const surfaceBase = isDark
    ? {
        bg: "#09090b",
        surface: "#111113",
        surfaceElevated: "#18181b",
        popover: "#18181b",
        text: "#f4f4f5",
        textMuted: "#a1a1aa",
        border: "#27272a",
        borderHover: "#3f3f46",
        input: "#131316",
        shadow: "0 22px 52px rgba(0, 0, 0, 0.28)",
      }
    : {
        bg: "#f5f5f5",
        surface: "#ffffff",
        surfaceElevated: "#fcfcfd",
        popover: "#ffffff",
        text: "#18181b",
        textMuted: "#71717a",
        border: "#e4e4e7",
        borderHover: "#d4d4d8",
        input: "#ffffff",
        shadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
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
  themeColor?: string;
}): void {
  const isDark = options.resolvedMode === "dark";
  const tokens = getThemeTokens(isDark, options.themeColor);

  document.documentElement.dataset.theme = options.resolvedMode;

  // Primary Action Color
  document.documentElement.style.setProperty("--app-primary", tokens.primary);
  document.documentElement.style.setProperty("--app-primary-rgb", tokens.primaryRgb);

  // Background and Surfaces
  document.documentElement.style.setProperty("--app-bg", tokens.bg);
  document.documentElement.style.setProperty("--app-surface", tokens.surface);
  document.documentElement.style.setProperty("--app-surface-elevated", tokens.surfaceElevated);
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
  isDark: boolean,
  themeColor = DEFAULT_THEME_COLOR,
): GlobalThemeOverrides {
  const t = getThemeTokens(isDark, themeColor);

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
