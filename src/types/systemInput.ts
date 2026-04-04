import type { TranslateRequest, TranslateResult } from "@/types/ai";

export type SystemInputTriggerMode = "double-space" | "double-alt" | "manual-hotkey";
export type SystemInputCaptureMode = "selection-first" | "before-caret-first" | "whole-input-first";
export type SystemInputWritebackMode =
  | "auto"
  | "native-replace"
  | "simulate-input"
  | "clipboard-paste"
  | "popup-only";
export type SystemInputPermissionState =
  | "unknown"
  | "granted"
  | "denied"
  | "not-required";

export interface SystemInputConfig {
  enabled: boolean;
  triggerMode: SystemInputTriggerMode;
  doubleTapIntervalMs: number;
  translateSelectionShortcut: string;
  translateClipboardShortcut: string;
  pasteLastTranslationShortcut: string;
  toggleEnabledShortcut: string;
  appBlacklist: string[];
  appWhitelist: string[];
  sourceLanguage: string;
  targetLanguage: string;
  onlySelectedText: boolean;
  autoReplace: boolean;
  replaceSelectionOnShortcutTranslate: boolean;
  enableClipboardFallback: boolean;
  showFloatingHint: boolean;
  onlyWhenEnglishText: boolean;
  excludeCodeEditors: boolean;
  debugLogging: boolean;
  captureMode: SystemInputCaptureMode;
  writebackMode: SystemInputWritebackMode;
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
  preferredStrategy: SystemInputCaptureMode | "selection-only";
}

export interface SystemInputTranslationRequestEvent {
  sessionId: string;
  triggerMode: SystemInputTriggerMode;
  sourceLanguage: string;
  targetLanguage: string;
  targetApp?: SystemInputTargetApp | null;
  capturedText: SystemInputCapturedText;
  emittedAt: string;
}

export interface SystemInputSelectionCaptureResult {
  text: string;
  targetApp?: SystemInputTargetApp | null;
}

export interface SystemInputTranslationSubmitPayload {
  sessionId: string;
  request: TranslateRequest;
  translatedText: string;
  displayText?: string | null;
  sourceText?: string | null;
  captureStrategy?: string | null;
  targetApp?: SystemInputTargetApp | null;
  openResultWindowOnFailure: boolean;
}

export interface SystemInputCancelSessionPayload {
  sessionId: string;
  error?: string | null;
}

export interface SystemInputWritebackResult {
  sessionId: string;
  success: boolean;
  usedStrategy: SystemInputWritebackMode | "popup-only" | "noop";
  fallbackWindowRequired: boolean;
  error?: string | null;
}

export interface SystemInputStatus {
  nativeReady: boolean;
  active: boolean;
  platform: string;
  permissionState: SystemInputPermissionState;
  lastError?: string | null;
  lastTargetApp?: SystemInputTargetApp | null;
}

export interface SystemInputInitPayload {
  config: SystemInputConfig;
  appWindowLabels: string[];
}

export interface SystemInputTranslationSessionResult {
  requestEvent: SystemInputTranslationRequestEvent;
  request: TranslateRequest;
  result: TranslateResult;
  modelName: string;
  writeback: SystemInputWritebackResult;
}

export function createDefaultSystemInputStatus(): SystemInputStatus {
  return {
    nativeReady: false,
    active: false,
    platform: "unknown",
    permissionState: "unknown",
    lastError: null,
    lastTargetApp: null,
  };
}
