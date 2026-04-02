import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow, type Window as TauriWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { TranslationWindowRunPayload } from "@/types/ai";

export const MAIN_WINDOW_LABEL = "main";
export const RESULT_WINDOW_LABEL = "result";
export const SETTINGS_WINDOW_LABEL = "settings";
export const TRANSLATION_RESULT_READY_EVENT = "translation-result:ready";
export const TRANSLATION_RESULT_RUN_EVENT = "translation-result:run";

export type SettingsWindowTab = "models" | "app";

interface FocusableWindow {
  show(): Promise<void>;
  hide(): Promise<void>;
  unminimize(): Promise<void>;
  setFocus(): Promise<void>;
  isVisible(): Promise<boolean>;
  isMinimized(): Promise<boolean>;
}

interface PositionedWindow extends FocusableWindow {
  outerPosition(): Promise<{ x: number; y: number }>;
  outerSize(): Promise<{ width: number; height: number }>;
  scaleFactor(): Promise<number>;
}

function getCurrentTauriWindow() {
  return getCurrentWindow();
}

async function focusWindow(windowHandle: FocusableWindow) {
  await windowHandle.show();
  await windowHandle.unminimize();
  await windowHandle.setFocus();
}

async function showWindow(windowHandle: FocusableWindow) {
  await windowHandle.show();
  await windowHandle.unminimize();
}

function buildSettingsWindowUrl(tab: SettingsWindowTab) {
  return `/#/settings-window?tab=${tab}`;
}

function buildResultWindowUrl() {
  return "/#/translate-result";
}

function waitForWindowCreated(windowHandle: WebviewWindow): Promise<WebviewWindow> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = async () => {
      await Promise.allSettled([removeCreatedListener?.(), removeErrorListener?.()]);
    };

    const resolveOnce = async () => {
      if (settled) {
        return;
      }

      settled = true;
      await cleanup();
      resolve(windowHandle);
    };

    const rejectOnce = async (reason: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      await cleanup();
      reject(reason);
    };

    let removeCreatedListener: (() => void) | undefined;
    let removeErrorListener: (() => void) | undefined;

    void windowHandle.once("tauri://created", () => {
      void resolveOnce();
    }).then((unlisten) => {
      removeCreatedListener = unlisten;
    });

    void windowHandle.once("tauri://error", (event) => {
      void rejectOnce(event.payload);
    }).then((unlisten) => {
      removeErrorListener = unlisten;
    });
  });
}

async function waitForWindowSignal(eventName: string, timeoutMs = 5_000) {
  const currentWindow = getCurrentTauriWindow();

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);

    void currentWindow.once(eventName, () => {
      window.clearTimeout(timeoutId);
      resolve();
    }).catch((error) => {
      window.clearTimeout(timeoutId);
      reject(error);
    });
  });
}

async function getMainWindowHandle(): Promise<PositionedWindow | null> {
  if (!isTauri()) {
    return null;
  }

  const currentWindow = getCurrentTauriWindow();

  if (currentWindow.label === MAIN_WINDOW_LABEL) {
    return currentWindow;
  }

  return await WebviewWindow.getByLabel(MAIN_WINDOW_LABEL);
}

async function getResultWindowHandle(): Promise<FocusableWindow | null> {
  if (!isTauri()) {
    return null;
  }

  if (getCurrentTauriWindow().label === RESULT_WINDOW_LABEL) {
    return getCurrentTauriWindow();
  }

  return await WebviewWindow.getByLabel(RESULT_WINDOW_LABEL);
}

async function createSettingsWindow(tab: SettingsWindowTab) {
  const settingsWindow = new WebviewWindow(SETTINGS_WINDOW_LABEL, {
    url: buildSettingsWindowUrl(tab),
    title: "AI Assistant 设置",
    width: 1120,
    height: 860,
    minWidth: 920,
    minHeight: 680,
    center: true,
    resizable: true,
    alwaysOnTop: true,
    decorations: false,
    transparent: true,
    shadow: true,
    visible: false,
  });

  return await waitForWindowCreated(settingsWindow);
}

async function createResultWindow() {
  const mainWindow = await getMainWindowHandle();

  const resultWindowOptions = {
    url: buildResultWindowUrl(),
    title: "AI Assistant Result",
    width: 780,
    height: 560,
    minWidth: 520,
    minHeight: 260,
    resizable: true,
    decorations: false,
    transparent: false,
    shadow: true,
    visible: false,
    skipTaskbar: true,
    focus: false,
  } as const;

  if (!mainWindow) {
    return await waitForWindowCreated(new WebviewWindow(RESULT_WINDOW_LABEL, resultWindowOptions));
  }

  const [position, size, scaleFactor] = await Promise.all([
    mainWindow.outerPosition(),
    mainWindow.outerSize(),
    mainWindow.scaleFactor(),
  ]);

  const logicalX = position.x / scaleFactor;
  const logicalY = position.y / scaleFactor;
  const logicalWidth = size.width / scaleFactor;
  const logicalHeight = size.height / scaleFactor;

  const resultWidth = resultWindowOptions.width;
  return await waitForWindowCreated(
    new WebviewWindow(RESULT_WINDOW_LABEL, {
      ...resultWindowOptions,
      x: logicalX + Math.round((logicalWidth - resultWidth) / 2),
      y: logicalY + logicalHeight + 18,
      preventOverflow: {
        width: 24,
        height: 24,
      },
    }),
  );
}

async function notifySettingsWindowTab(tab: SettingsWindowTab) {
  await getCurrentTauriWindow().emitTo(SETTINGS_WINDOW_LABEL, "settings-window:navigate", { tab });
}

export function resolveSettingsWindowTab(value: unknown): SettingsWindowTab {
  return value === "app" ? "app" : "models";
}

export async function showTranslationWindow() {
  const mainWindow = await getMainWindowHandle();

  if (!mainWindow) {
    return;
  }

  const currentWindow = getCurrentTauriWindow();

  if (currentWindow.label === SETTINGS_WINDOW_LABEL) {
    await currentWindow.hide();
  }

  await focusWindow(mainWindow);
}

export async function toggleTranslationWindowVisibility() {
  const mainWindow = await getMainWindowHandle();

  if (!mainWindow) {
    return;
  }

  const [isVisible, isMinimized] = await Promise.all([
    mainWindow.isVisible(),
    mainWindow.isMinimized(),
  ]);

  if (isVisible && !isMinimized) {
    await hideResultWindow();
    await mainWindow.hide();
    return;
  }

  await focusWindow(mainWindow);
}

export async function hideResultWindow() {
  const resultWindow = await getResultWindowHandle();

  if (!resultWindow) {
    return;
  }

  await resultWindow.hide();
}

export async function openSettingsWindow(tab: SettingsWindowTab = "models") {
  if (!isTauri()) {
    return null;
  }

  const existingWindow = await WebviewWindow.getByLabel(SETTINGS_WINDOW_LABEL);
  const settingsWindow = existingWindow ?? (await createSettingsWindow(tab));

  if (existingWindow) {
    await notifySettingsWindowTab(tab);
  }

  await focusWindow(settingsWindow);

  return settingsWindow;
}

export async function openResultWindow() {
  if (!isTauri()) {
    return null;
  }

  const existingWindow = await WebviewWindow.getByLabel(RESULT_WINDOW_LABEL);

  if (existingWindow) {
    await showWindow(existingWindow);
    return existingWindow;
  }

  const readyPromise = waitForWindowSignal(TRANSLATION_RESULT_READY_EVENT);
  const resultWindow = await createResultWindow();

  try {
    await readyPromise;
  } catch (error) {
    console.warn("Result window ready signal was not received in time", error);
  }

  await showWindow(resultWindow);
  return resultWindow;
}

export async function requestTranslationInResultWindow(payload: TranslationWindowRunPayload) {
  const resultWindow = await openResultWindow();

  if (!resultWindow) {
    throw new Error("当前环境不支持独立结果窗口。");
  }

  await getCurrentTauriWindow().emitTo(RESULT_WINDOW_LABEL, TRANSLATION_RESULT_RUN_EVENT, payload);
}

export function isMainWindow(windowHandle: Pick<TauriWindow, "label">) {
  return windowHandle.label === MAIN_WINDOW_LABEL;
}
