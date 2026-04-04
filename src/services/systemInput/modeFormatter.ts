import type {
  SystemInputCaptureMode,
  SystemInputPermissionState,
  SystemInputTriggerMode,
  SystemInputWritebackMode,
} from "@/types/systemInput";

export function formatSystemInputTriggerMode(mode: SystemInputTriggerMode): string {
  switch (mode) {
    case "double-space":
      return "双空格";
    case "double-alt":
      return "双 Alt";
    case "manual-hotkey":
      return "手动热键";
  }
}

export function formatSystemInputCaptureMode(mode: SystemInputCaptureMode): string {
  switch (mode) {
    case "selection-first":
      return "选中文本优先";
    case "before-caret-first":
      return "光标前优先";
    case "whole-input-first":
      return "整段输入优先";
  }
}

export function formatSystemInputWritebackMode(mode: SystemInputWritebackMode): string {
  switch (mode) {
    case "auto":
      return "自动";
    case "native-replace":
      return "原生替换";
    case "simulate-input":
      return "模拟输入";
    case "clipboard-paste":
      return "剪贴板粘贴";
    case "popup-only":
      return "仅结果窗";
  }
}

export function formatSystemInputPermissionState(state: SystemInputPermissionState): string {
  switch (state) {
    case "granted":
      return "已授权";
    case "denied":
      return "未授权";
    case "not-required":
      return "无需授权";
    case "unknown":
    default:
      return "未知";
  }
}

export function parseSystemInputAppList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function stringifySystemInputAppList(value: string[]): string {
  return value.join("\n");
}
