export type ThemeMode = "light" | "dark" | "auto";
export type ResolvedThemeMode = Exclude<ThemeMode, "auto">;
export type AIProviderType = "openai-compatible";
export type AppLocale = "zh-CN" | "en-US";
export type CloseBehavior = "ask" | "hide-to-tray" | "close";

export interface AppPreferences {
  themeMode: ThemeMode;
  themeColor: string;
  locale: AppLocale;
  closeBehavior: CloseBehavior;
  historyLimit: number;
  globalShortcut: string;
}

export interface ModelConfig {
  id: string;
  name: string;
  provider: AIProviderType;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  isDefault: boolean;
  systemPrompt: string;
  timeoutMs: number;
  extraHeaders: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ModelConfigDraft {
  id?: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number | null;
  maxTokens: number | null;
  enabled: boolean;
  isDefault: boolean;
  systemPrompt: string;
  timeoutMs: number | null;
  extraHeadersText: string;
}

export interface AppConfig {
  preferences: AppPreferences;
  models: ModelConfig[];
}
