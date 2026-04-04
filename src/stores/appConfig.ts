import { computed, ref } from "vue";
import { acceptHMRUpdate, defineStore } from "pinia";
import {
  createDefaultAppConfig,
  createDefaultPreferences,
  createMockModelConfigs,
  normalizeHistoryLimit,
} from "@/constants/app";
import {
  getLaunchAtStartupEnabled,
  setLaunchAtStartupEnabled,
} from "@/services/app/autoLaunchService";
import { createLogger } from "@/services/logging/logger";
import { loadAppConfig, saveAppConfig } from "@/services/storage/appConfigStorage";
import type {
  AppConfig,
  AppLocale,
  AppPreferences,
  CloseBehavior,
  ModelConfig,
  ThemeMode,
} from "@/types/app";
import type { LoggingPreferences } from "@/types/log";
import type { SystemInputConfig } from "@/types/systemInput";

const APP_CONFIG_SYNC_CHANNEL = "ai-assistant:app-config";
const APP_CONFIG_SYNC_SOURCE =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `app-config-${Date.now()}-${Math.random().toString(16).slice(2)}`;

let syncChannel: BroadcastChannel | null = null;
const logger = createLogger({
  source: "store",
  category: "settings",
});

function getSyncChannel() {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }

  syncChannel ??= new BroadcastChannel(APP_CONFIG_SYNC_CHANNEL);
  return syncChannel;
}

function normalizeModels(models: ModelConfig[]): ModelConfig[] {
  if (models.length === 0) {
    return models;
  }

  const activeDefault =
    models.find((model) => model.isDefault && model.enabled) ??
    models.find((model) => model.enabled) ??
    models[0];

  return models.map((model) => ({
    ...model,
    isDefault: model.id === activeDefault.id,
  }));
}

export const useAppConfigStore = defineStore("app-config", () => {
  const config = ref<AppConfig>(createDefaultAppConfig());
  const initialized = ref(false);
  let stopConfigSync: (() => void) | null = null;

  const preferences = computed(() => config.value.preferences);
  const models = computed(() => config.value.models);
  const enabledModels = computed(() => config.value.models.filter((model) => model.enabled));
  const defaultModel = computed(
    () =>
      config.value.models.find((model) => model.isDefault && model.enabled) ??
      config.value.models.find((model) => model.enabled) ??
      null,
  );
  const selectedTranslationModel = computed(
    () =>
      enabledModels.value.find(
        (model) => model.id === config.value.preferences.selectedTranslationModelId,
      ) ??
      defaultModel.value ??
      enabledModels.value[0] ??
      null,
  );

  async function hydrateFromStorage() {
    config.value = await loadAppConfig();
    initialized.value = true;
  }

  function broadcastConfigChange() {
    getSyncChannel()?.postMessage({
      source: APP_CONFIG_SYNC_SOURCE,
      updatedAt: new Date().toISOString(),
    });
  }

  function ensureConfigSync() {
    if (stopConfigSync) {
      return;
    }

    const channel = getSyncChannel();

    if (!channel) {
      return;
    }

    const handleMessage = (event: MessageEvent<{ source?: string }>) => {
      if (event.data?.source === APP_CONFIG_SYNC_SOURCE) {
        return;
      }

      void hydrateFromStorage();
    };

    channel.addEventListener("message", handleMessage);
    stopConfigSync = () => {
      channel.removeEventListener("message", handleMessage);
    };
  }

  async function persist() {
    await saveAppConfig(config.value);
    broadcastConfigChange();
  }

  async function initialize() {
    ensureConfigSync();

    if (initialized.value) {
      return;
    }

    await hydrateFromStorage();
  }

  async function updatePreferences(partial: Partial<AppPreferences>) {
    config.value = {
      ...config.value,
      preferences: {
        ...config.value.preferences,
        ...partial,
      },
    };

    await persist();
  }

  async function setThemeMode(themeMode: ThemeMode) {
    await updatePreferences({ themeMode });
    await logger.info("settings.theme.change", "主题模式已更新", {
      detail: { themeMode },
    });
  }

  async function setLocale(locale: AppLocale) {
    await updatePreferences({ locale });
    await logger.info("settings.locale.change", "应用语言已更新", {
      detail: { locale },
    });
  }

  async function setCloseBehavior(closeBehavior: CloseBehavior) {
    await updatePreferences({ closeBehavior });
    await logger.info("settings.close-behavior.change", "关闭行为已更新", {
      detail: { closeBehavior },
    });
  }

  async function setLaunchAtStartup(launchAtStartup: boolean) {
    const resolved = await setLaunchAtStartupEnabled(launchAtStartup);
    await updatePreferences({ launchAtStartup: resolved });
    await logger.info("settings.auto-launch.change", "开机自启动设置已更新", {
      detail: {
        requested: launchAtStartup,
        resolved,
      },
    });
    return resolved;
  }

  async function syncLaunchAtStartupPreference() {
    const launchAtStartup = await getLaunchAtStartupEnabled();

    if (config.value.preferences.launchAtStartup === launchAtStartup) {
      return launchAtStartup;
    }

    await updatePreferences({ launchAtStartup });
    return launchAtStartup;
  }

  async function setHistoryLimit(historyLimit: number) {
    const normalized = normalizeHistoryLimit(historyLimit);
    await updatePreferences({ historyLimit: normalized });
    await logger.info("settings.history-limit.change", "历史记录上限已更新", {
      detail: { historyLimit: normalized },
    });
  }

  async function setGlobalShortcut(globalShortcut: string) {
    await updatePreferences({ globalShortcut });
    await logger.info("shortcut.global.change", "主窗口快捷键已更新", {
      category: "shortcut",
      detail: { globalShortcut },
    });
  }

  async function setTranslateShortcut(translateShortcut: string) {
    await updatePreferences({ translateShortcut });
    await logger.info("shortcut.translate.change", "翻译快捷键已更新", {
      category: "shortcut",
      detail: { translateShortcut },
    });
  }

  async function setSelectedTranslationModelId(selectedTranslationModelId: string | null) {
    await updatePreferences({ selectedTranslationModelId });
    await logger.info("provider.selected.change", "默认翻译模型选择已更新", {
      category: "provider",
      detail: { selectedTranslationModelId },
    });
  }

  async function setTranslationPreferences(translation: AppPreferences["translation"]) {
    await updatePreferences({ translation });
  }

  async function updateTranslationPreferences(partial: Partial<AppPreferences["translation"]>) {
    await updatePreferences({
      translation: {
        ...config.value.preferences.translation,
        ...partial,
      },
    });
    await logger.info("settings.translation.change", "翻译偏好已更新", {
      detail: partial,
    });
  }

  async function setLoggingPreferences(logging: LoggingPreferences) {
    await updatePreferences({ logging });
  }

  async function updateLoggingPreferences(partial: Partial<LoggingPreferences>) {
    await updatePreferences({
      logging: {
        ...config.value.preferences.logging,
        ...partial,
      },
    });
    await logger.info("settings.logging.change", "日志设置已更新", {
      detail: partial,
    });
  }

  async function setSystemInputConfig(systemInput: SystemInputConfig) {
    await updatePreferences({ systemInput });
  }

  async function updateSystemInputConfig(partial: Partial<SystemInputConfig>) {
    await updatePreferences({
      systemInput: {
        ...config.value.preferences.systemInput,
        ...partial,
      },
    });
    await logger.info("settings.system-input.change", "系统输入配置已更新", {
      detail: partial,
    });
  }

  async function resetPreferences() {
    const nextPreferences = createDefaultPreferences();

    if (config.value.preferences.launchAtStartup !== nextPreferences.launchAtStartup) {
      nextPreferences.launchAtStartup = await setLaunchAtStartupEnabled(
        nextPreferences.launchAtStartup,
      );
    }

    config.value = {
      ...config.value,
      preferences: nextPreferences,
    };

    await persist();
    await logger.warn("settings.reset", "偏好设置已恢复默认", {
      detail: {
        themeMode: nextPreferences.themeMode,
        locale: nextPreferences.locale,
      },
    });
  }

  async function upsertModel(model: ModelConfig) {
    const nextModels = [...config.value.models];
    const index = nextModels.findIndex((item) => item.id === model.id);

    if (index >= 0) {
      nextModels.splice(index, 1, model);
    } else {
      nextModels.unshift(model);
    }

    config.value = {
      ...config.value,
      models: normalizeModels(nextModels),
    };

    await persist();
    await logger.info("provider.upsert", "模型配置已保存", {
      category: "provider",
      detail: {
        id: model.id,
        name: model.name,
        provider: model.provider,
        enabled: model.enabled,
        isDefault: model.isDefault,
      },
      relatedEntity: {
        type: "model",
        id: model.id,
        name: model.name,
      },
    });
  }

  async function patchModel(id: string, patch: Partial<ModelConfig>) {
    const current = config.value.models.find((model) => model.id === id);

    if (!current) {
      return;
    }

    await upsertModel({
      ...current,
      ...patch,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    });
  }

  async function removeModel(id: string) {
    config.value = {
      ...config.value,
      models: normalizeModels(config.value.models.filter((model) => model.id !== id)),
    };

    await persist();
    await logger.warn("provider.remove", "模型配置已删除", {
      category: "provider",
      detail: { id },
      relatedEntity: {
        type: "model",
        id,
      },
    });
  }

  async function setDefaultModel(id: string) {
    config.value = {
      ...config.value,
      models: normalizeModels(
        config.value.models.map((model) =>
          model.id === id
            ? {
                ...model,
                enabled: true,
                isDefault: true,
              }
            : model,
        ),
      ),
    };

    await persist();
    await logger.info("provider.default.change", "默认模型已更新", {
      category: "provider",
      detail: { id },
      relatedEntity: {
        type: "model",
        id,
      },
    });
  }

  async function seedMockModels() {
    const existingIds = new Set(config.value.models.map((model) => model.id));
    const nextModels = [
      ...config.value.models,
      ...createMockModelConfigs().filter((model) => !existingIds.has(model.id)),
    ];

    config.value = {
      ...config.value,
      models: normalizeModels(nextModels),
    };

    await persist();
  }

  return {
    config,
    initialized,
    preferences,
    models,
    enabledModels,
    defaultModel,
    selectedTranslationModel,
    initialize,
    setThemeMode,
    setLocale,
    setCloseBehavior,
    setLaunchAtStartup,
    syncLaunchAtStartupPreference,
    setHistoryLimit,
    setGlobalShortcut,
    setTranslateShortcut,
    setSelectedTranslationModelId,
    setTranslationPreferences,
    updateTranslationPreferences,
    setLoggingPreferences,
    updateLoggingPreferences,
    setSystemInputConfig,
    updateSystemInputConfig,
    resetPreferences,
    upsertModel,
    patchModel,
    removeModel,
    setDefaultModel,
    seedMockModels,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAppConfigStore, import.meta.hot));
  import.meta.hot.dispose(() => {
    syncChannel?.close();
    syncChannel = null;
  });
}
