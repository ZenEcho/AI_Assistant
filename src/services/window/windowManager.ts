import { isTauri } from "@tauri-apps/api/core";
import {
  getCurrentWindow,
  type Window as TauriWindow,
} from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { createLogger } from "@/services/logging/logger";
import { toErrorStack } from "@/utils/error";
import type { SystemInputTargetLanguageOverlayPayload } from "@/services/systemInput/targetLanguageSwitcher";
import type { TranslationResultPresentPayload, TranslationWindowRunPayload } from "@/types/ai";

export const MAIN_WINDOW_LABEL = "main";
export const RESULT_WINDOW_LABEL = "result";
export const SETTINGS_WINDOW_LABEL = "settings";
export const TARGET_LANGUAGE_OVERLAY_WINDOW_LABEL = "target-language-overlay";
export const TRANSLATION_RESULT_READY_EVENT = "translation-result:ready";
export const TRANSLATION_RESULT_RUN_EVENT = "translation-result:run";
export const TRANSLATION_RESULT_PRESENT_EVENT = "translation-result:present";
export const TRANSLATION_RESULT_VISIBILITY_EVENT = "translation-result:visibility";
export const SYSTEM_INPUT_TARGET_LANGUAGE_OVERLAY_READY_EVENT =
  "system-input:target-language-overlay-ready";
export const SYSTEM_INPUT_TARGET_LANGUAGE_OVERLAY_SYNC_EVENT =
  "system-input:target-language-overlay-sync";
export const SYSTEM_INPUT_TARGET_LANGUAGE_OVERLAY_CLOSED_EVENT =
  "system-input:target-language-overlay-closed";

export type SettingsWindowTab = "models" | "app" | "logs";

export interface TranslationResultVisibilityPayload {
  visible: boolean;
}

type TargetLanguageOverlaySessionState = "closed" | "opening" | "open";

const TARGET_LANGUAGE_OVERLAY_WIDTH = 420;
const TARGET_LANGUAGE_OVERLAY_HEIGHT = 248;

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

let targetLanguageOverlayWindowPromise: Promise<WebviewWindow | null> | null = null;
let targetLanguageOverlaySessionState: TargetLanguageOverlaySessionState = "closed";
let removeTargetLanguageOverlayClosedListener: (() => void) | null = null;
const logger = createLogger({
  source: "window-manager",
  category: "window",
});

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

function buildTargetLanguageOverlayUrl() {
  return "/#/system-input-target-language-overlay";
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

async function getSettingsWindowHandle(): Promise<FocusableWindow | null> {
  if (!isTauri()) {
    return null;
  }

  if (getCurrentTauriWindow().label === SETTINGS_WINDOW_LABEL) {
    return getCurrentTauriWindow();
  }

  return await WebviewWindow.getByLabel(SETTINGS_WINDOW_LABEL);
}

async function getTargetLanguageOverlayHandle(): Promise<WebviewWindow | null> {
  if (!isTauri()) {
    return null;
  }

  if (getCurrentTauriWindow().label === TARGET_LANGUAGE_OVERLAY_WINDOW_LABEL) {
    return getCurrentTauriWindow() as unknown as WebviewWindow;
  }

  return await WebviewWindow.getByLabel(TARGET_LANGUAGE_OVERLAY_WINDOW_LABEL);
}

async function getShortcutManagedWindows() {
  const [mainWindow, settingsWindow, resultWindow] = await Promise.all([
    getMainWindowHandle(),
    getSettingsWindowHandle(),
    getResultWindowHandle(),
  ]);

  return [
    { label: MAIN_WINDOW_LABEL, windowHandle: mainWindow },
    { label: SETTINGS_WINDOW_LABEL, windowHandle: settingsWindow },
    { label: RESULT_WINDOW_LABEL, windowHandle: resultWindow },
  ].filter(
    (
      entry,
    ): entry is {
      label: string;
      windowHandle: FocusableWindow;
    } => Boolean(entry.windowHandle),
  );
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

async function ensureTargetLanguageOverlayClosedListener() {
  if (!isTauri() || removeTargetLanguageOverlayClosedListener) {
    return;
  }

  removeTargetLanguageOverlayClosedListener = await getCurrentTauriWindow().listen(
    SYSTEM_INPUT_TARGET_LANGUAGE_OVERLAY_CLOSED_EVENT,
    () => {
      targetLanguageOverlaySessionState = "closed";
    },
  );
}

async function placeTargetLanguageOverlayWindow(windowHandle: WebviewWindow) {
  void windowHandle;
}

async function createTargetLanguageOverlayWindow() {
  await ensureTargetLanguageOverlayClosedListener();
  targetLanguageOverlaySessionState = "opening";

  const overlayWindow = new WebviewWindow(TARGET_LANGUAGE_OVERLAY_WINDOW_LABEL, {
    url: buildTargetLanguageOverlayUrl(),
    title: "AI Assistant Target Language",
    width: TARGET_LANGUAGE_OVERLAY_WIDTH,
    height: TARGET_LANGUAGE_OVERLAY_HEIGHT,
    center: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    closable: false,
    decorations: false,
    transparent: true,
    shadow: true,
    visible: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focus: false,
    parent: MAIN_WINDOW_LABEL,
    backgroundColor: [0, 0, 0, 0],
  });

  return await waitForWindowCreated(overlayWindow);
}

async function notifySettingsWindowTab(tab: SettingsWindowTab) {
  await getCurrentTauriWindow().emitTo(SETTINGS_WINDOW_LABEL, "settings-window:navigate", { tab });
}

export function resolveSettingsWindowTab(value: unknown): SettingsWindowTab {
  return value === "app" || value === "logs" ? value : "models";
}

export async function showTranslationWindow() {
  const mainWindow = await getMainWindowHandle();

  if (!mainWindow) {
    return;
  }

  const currentWindow = getCurrentTauriWindow();

  if (currentWindow.label === SETTINGS_WINDOW_LABEL) {
    await currentWindow.hide();
    await logger.info("window.settings.hide", "设置窗口已隐藏", {
      detail: { from: currentWindow.label },
    });
  }

  await focusWindow(mainWindow);
  await logger.info("window.main.focus", "主窗口已显示并聚焦");
}

export function hasSystemInputTargetLanguageOverlaySession() {
  return targetLanguageOverlaySessionState !== "closed";
}

export function beginSystemInputTargetLanguageOverlaySession() {
  if (targetLanguageOverlaySessionState === "closed") {
    targetLanguageOverlaySessionState = "opening";
  }
}

export function clearSystemInputTargetLanguageOverlaySession() {
  targetLanguageOverlaySessionState = "closed";
}

export async function toggleTranslationWindowVisibility() {
  const managedWindows = await getShortcutManagedWindows();
  const mainWindow = managedWindows.find((entry) => entry.label === MAIN_WINDOW_LABEL)?.windowHandle;

  if (!mainWindow || !managedWindows.length) {
    return;
  }

  const visibilityStates = await Promise.all(
    managedWindows.map(async ({ windowHandle }) => {
      const [isVisible, isMinimized] = await Promise.all([
        windowHandle.isVisible(),
        windowHandle.isMinimized(),
      ]);

      return isVisible && !isMinimized;
    }),
  );

  if (visibilityStates.some(Boolean)) {
    await Promise.allSettled(
      managedWindows.map(async ({ windowHandle }) => {
        await windowHandle.hide();
      }),
    );
    return;
  }

  await showWindow(mainWindow);

  await Promise.allSettled(
    managedWindows
      .filter((entry) => entry.label !== MAIN_WINDOW_LABEL)
      .map(async ({ windowHandle }) => {
        await showWindow(windowHandle);
      }),
  );

  await mainWindow.setFocus();
}

export async function isSystemInputTargetLanguageOverlayActive() {
  if (targetLanguageOverlayWindowPromise) {
    return true;
  }

  const overlayWindow = await getTargetLanguageOverlayHandle();

  if (!overlayWindow) {
    targetLanguageOverlaySessionState = "closed";
    return false;
  }

  const [isVisible, isMinimized] = await Promise.all([
    overlayWindow.isVisible(),
    overlayWindow.isMinimized(),
  ]);
  const active = isVisible && !isMinimized;

  targetLanguageOverlaySessionState = active ? "open" : "closed";
  return active;
}

export async function prewarmSystemInputTargetLanguageOverlayWindow() {
  if (!isTauri()) {
    return null;
  }

  if (await isSystemInputTargetLanguageOverlayActive()) {
    return await getTargetLanguageOverlayHandle();
  }

  const overlayWindow = await ensureTargetLanguageOverlayWindow();
  clearSystemInputTargetLanguageOverlaySession();
  return overlayWindow;
}

export async function hideResultWindow() {
  const resultWindow = await getResultWindowHandle();

  if (!resultWindow) {
    return;
  }

  await resultWindow.hide();
  await logger.info("window.result.hide", "结果窗口已隐藏");
}

export async function isResultWindowVisible() {
  const resultWindow = await getResultWindowHandle();

  if (!resultWindow) {
    return false;
  }

  const [visible, minimized] = await Promise.all([
    resultWindow.isVisible(),
    resultWindow.isMinimized(),
  ]);

  return visible && !minimized;
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
  await logger.info("window.settings.open", "设置窗口已打开", {
    detail: {
      tab,
      existed: Boolean(existingWindow),
    },
    windowLabel: SETTINGS_WINDOW_LABEL,
  });

  return settingsWindow;
}

export async function openResultWindow(options?: { focus?: boolean }) {
  if (!isTauri()) {
    return null;
  }

  const shouldFocus = options?.focus ?? false;
  const existingWindow = await WebviewWindow.getByLabel(RESULT_WINDOW_LABEL);

  if (existingWindow) {
    if (shouldFocus) {
      await focusWindow(existingWindow);
    } else {
      await showWindow(existingWindow);
    }
    await logger.info("window.result.open", "结果窗口已复用", {
      detail: {
        focus: shouldFocus,
      },
      windowLabel: RESULT_WINDOW_LABEL,
    });
    return existingWindow;
  }

  const readyPromise = waitForWindowSignal(TRANSLATION_RESULT_READY_EVENT);
  const resultWindow = await createResultWindow();

  try {
    await readyPromise;
  } catch (error) {
    await logger.warn("window.result.ready-timeout", "结果窗口就绪信号等待超时", {
      errorStack: toErrorStack(error),
      windowLabel: RESULT_WINDOW_LABEL,
    });
  }

  if (shouldFocus) {
    await focusWindow(resultWindow);
  } else {
    await showWindow(resultWindow);
  }
  await logger.info("window.result.open", "结果窗口已创建", {
    detail: {
      focus: shouldFocus,
    },
    windowLabel: RESULT_WINDOW_LABEL,
  });
  return resultWindow;
}

export async function showResultWindow(options?: { focus?: boolean }) {
  return await openResultWindow({
    focus: options?.focus ?? true,
  });
}

export async function toggleResultWindowVisibility() {
  if (await isResultWindowVisible()) {
    await hideResultWindow();
    return false;
  }

  const resultWindow = await showResultWindow({
    focus: true,
  });

  return Boolean(resultWindow);
}

async function ensureTargetLanguageOverlayWindow() {
  if (!isTauri()) {
    clearSystemInputTargetLanguageOverlaySession();
    return null;
  }

  const existingWindow = await getTargetLanguageOverlayHandle();

  if (existingWindow) {
    return existingWindow;
  }

  if (targetLanguageOverlayWindowPromise) {
    return await targetLanguageOverlayWindowPromise;
  }

  targetLanguageOverlayWindowPromise = (async () => {
    const readyPromise = waitForWindowSignal(SYSTEM_INPUT_TARGET_LANGUAGE_OVERLAY_READY_EVENT);
    const overlayWindow = await createTargetLanguageOverlayWindow();

    try {
      await readyPromise;
    } catch (error) {
      await logger.warn("window.overlay.ready-timeout", "目标语言悬浮窗就绪信号等待超时", {
        errorStack: toErrorStack(error),
        windowLabel: TARGET_LANGUAGE_OVERLAY_WINDOW_LABEL,
      });
    }

    return overlayWindow;
  })().finally(() => {
    targetLanguageOverlayWindowPromise = null;
  });

  try {
    return await targetLanguageOverlayWindowPromise;
  } catch (error) {
    clearSystemInputTargetLanguageOverlaySession();
    throw error;
  }
}

export async function showSystemInputTargetLanguageOverlay(
  payload: SystemInputTargetLanguageOverlayPayload,
) {
  const overlayWindow = await ensureTargetLanguageOverlayWindow();

  if (!overlayWindow) {
    clearSystemInputTargetLanguageOverlaySession();
    return null;
  }

  await placeTargetLanguageOverlayWindow(overlayWindow);
  await overlayWindow.emit(SYSTEM_INPUT_TARGET_LANGUAGE_OVERLAY_SYNC_EVENT, payload);
  await showWindow(overlayWindow);
  targetLanguageOverlaySessionState = "open";
  await logger.info("window.overlay.show", "目标语言悬浮窗已显示", {
    windowLabel: TARGET_LANGUAGE_OVERLAY_WINDOW_LABEL,
    detail: {
      targetLanguage: payload.value,
      targetLanguageLabel: payload.label,
    },
  });

  return overlayWindow;
}

export async function closeSystemInputTargetLanguageOverlay() {
  const overlayWindow = await getTargetLanguageOverlayHandle();
  clearSystemInputTargetLanguageOverlaySession();

  if (!overlayWindow) {
    return;
  }

  await overlayWindow.destroy();
  await logger.info("window.overlay.close", "目标语言悬浮窗已关闭", {
    windowLabel: TARGET_LANGUAGE_OVERLAY_WINDOW_LABEL,
  });
}

export async function requestTranslationInResultWindow(payload: TranslationWindowRunPayload) {
  const resultWindow = await openResultWindow({
    focus: true,
  });

  if (!resultWindow) {
    throw new Error("当前环境不支持独立结果窗口。");
  }

  await getCurrentTauriWindow().emitTo(RESULT_WINDOW_LABEL, TRANSLATION_RESULT_RUN_EVENT, payload);
  await logger.info("window.result.run", "已向结果窗口发送翻译请求", {
    windowLabel: RESULT_WINDOW_LABEL,
    detail: {
      modelId: payload.modelId,
      sourceLanguage: payload.request.sourceLanguage,
      targetLanguage: payload.request.targetLanguage,
    },
  });
}

export async function presentTranslationResultInResultWindow(
  payload: TranslationResultPresentPayload,
) {
  const resultWindow = await openResultWindow({
    focus: false,
  });

  if (!resultWindow) {
    throw new Error("当前环境不支持独立结果窗口。");
  }

  await getCurrentTauriWindow().emitTo(
    RESULT_WINDOW_LABEL,
    TRANSLATION_RESULT_PRESENT_EVENT,
    payload,
  );
  await logger.info("window.result.present", "已向结果窗口发送翻译结果", {
    windowLabel: RESULT_WINDOW_LABEL,
    detail: {
      modelName: payload.modelName,
      provider: payload.result.provider,
      requestSourceLanguage: payload.request?.sourceLanguage,
      requestTargetLanguage: payload.request?.targetLanguage,
    },
  });
}

export function isMainWindow(windowHandle: Pick<TauriWindow, "label">) {
  return windowHandle.label === MAIN_WINDOW_LABEL;
}
