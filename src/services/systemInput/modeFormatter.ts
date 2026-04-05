import type { SystemInputPermissionState } from "@/types/systemInput";

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
