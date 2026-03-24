import type { AppLocale } from "@/types/app";

type MessageKey =
  | "appName"
  | "workspaceHint"
  | "nav.translate"
  | "nav.models"
  | "nav.settings"
  | "topbar.themeLight"
  | "topbar.themeDark"
  | "topbar.language"
  | "topbar.openSettings"
  | "topbar.minimize"
  | "topbar.maximize"
  | "topbar.restore"
  | "topbar.close";

const messages: Record<AppLocale, Record<MessageKey, string>> = {
  "zh-CN": {
    appName: "AI Assistant",
    workspaceHint: "无边框自绘标题栏工作区",
    "nav.translate": "翻译",
    "nav.models": "模型设置",
    "nav.settings": "应用设置",
    "topbar.themeLight": "切换到浅色",
    "topbar.themeDark": "切换到深色",
    "topbar.language": "切换语言",
    "topbar.openSettings": "打开设置",
    "topbar.minimize": "最小化",
    "topbar.maximize": "最大化",
    "topbar.restore": "还原",
    "topbar.close": "关闭",
  },
  "en-US": {
    appName: "AI Assistant",
    workspaceHint: "Frameless custom title bar workspace",
    "nav.translate": "Translate",
    "nav.models": "Models",
    "nav.settings": "Settings",
    "topbar.themeLight": "Switch to light",
    "topbar.themeDark": "Switch to dark",
    "topbar.language": "Change language",
    "topbar.openSettings": "Open settings",
    "topbar.minimize": "Minimize",
    "topbar.maximize": "Maximize",
    "topbar.restore": "Restore",
    "topbar.close": "Close",
  },
};

export function getMessage(locale: AppLocale, key: MessageKey): string {
  return messages[locale][key] ?? messages["zh-CN"][key];
}
