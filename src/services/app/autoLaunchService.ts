import { isTauri } from "@tauri-apps/api/core";
import {
  disable as disableAutoLaunch,
  enable as enableAutoLaunch,
  isEnabled as isAutoLaunchEnabled,
} from "@tauri-apps/plugin-autostart";

export async function getLaunchAtStartupEnabled(): Promise<boolean> {
  if (!isTauri()) {
    return false;
  }

  return await isAutoLaunchEnabled();
}

export async function setLaunchAtStartupEnabled(enabled: boolean): Promise<boolean> {
  if (!isTauri()) {
    return false;
  }

  if (enabled) {
    await enableAutoLaunch();
  } else {
    await disableAutoLaunch();
  }

  return await isAutoLaunchEnabled();
}
