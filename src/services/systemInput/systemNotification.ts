import { isTauri } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let permissionResolved = false;
let permissionGranted = false;

async function ensureNotificationPermission() {
  if (!isTauri()) {
    return false;
  }

  if (permissionResolved) {
    return permissionGranted;
  }

  try {
    permissionGranted = await isPermissionGranted();

    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === "granted";
    }
  } catch {
    permissionGranted = false;
  } finally {
    permissionResolved = true;
  }

  return permissionGranted;
}

export async function showSystemInputNotification(title: string, body?: string) {
  if (!(await ensureNotificationPermission())) {
    return false;
  }

  sendNotification({
    title,
    body,
  });

  return true;
}
