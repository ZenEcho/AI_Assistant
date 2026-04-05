import type { TranslateRequest, TranslateResult } from "@/types/ai";

export type SystemInputPermissionState =
  | "unknown"
  | "granted"
  | "denied"
  | "not-required";

export interface SystemInputConfig {
  enabled: boolean;
  translateSelectionShortcut: string;
  translateClipboardShortcut: string;
  pasteLastTranslationShortcut: string;
  toggleEnabledShortcut: string;
  targetLanguageSwitchShortcut: string;
  sourceLanguage: string;
}

export interface SystemInputTargetApp {
  processId?: number | null;
  processName?: string | null;
  bundleId?: string | null;
  appName?: string | null;
  windowTitle?: string | null;
  windowHandle?: string | null;
}

export interface SystemInputCapturedText {
  selectedText?: string | null;
  beforeCaretText?: string | null;
  wholeInputText?: string | null;
  preferredText: string;
  preferredStrategy: string;
}

export interface SystemInputStatus {
  nativeReady: boolean;
  active: boolean;
  platform: string;
  permissionState: SystemInputPermissionState;
  lastError?: string | null;
}

export interface SystemInputTranslationSessionResult {
  request: TranslateRequest;
  result: TranslateResult;
  modelName: string;
}

export function createDefaultSystemInputStatus(): SystemInputStatus {
  return {
    nativeReady: false,
    active: false,
    platform: "unknown",
    permissionState: "unknown",
    lastError: null,
  };
}
