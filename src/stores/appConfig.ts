import { computed, ref } from "vue";
import { acceptHMRUpdate, defineStore } from "pinia";
import {
  createDefaultAppConfig,
  createDefaultPreferences,
  createMockModelConfigs,
  normalizeHistoryLimit,
} from "@/constants/app";
import { loadAppConfig, saveAppConfig } from "@/services/storage/appConfigStorage";
import type {
  AppConfig,
  AppLocale,
  AppPreferences,
  CloseBehavior,
  ModelConfig,
  ThemeMode,
} from "@/types/app";

const APP_CONFIG_SYNC_CHANNEL = "ai-assistant:app-config";
const APP_CONFIG_SYNC_SOURCE =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `app-config-${Date.now()}-${Math.random().toString(16).slice(2)}`;

let syncChannel: BroadcastChannel | null = null;

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
  }

  async function setLocale(locale: AppLocale) {
    await updatePreferences({ locale });
  }

  async function setCloseBehavior(closeBehavior: CloseBehavior) {
    await updatePreferences({ closeBehavior });
  }

  async function setHistoryLimit(historyLimit: number) {
    await updatePreferences({ historyLimit: normalizeHistoryLimit(historyLimit) });
  }

  async function setGlobalShortcut(globalShortcut: string) {
    await updatePreferences({ globalShortcut });
  }

  async function setTranslateShortcut(translateShortcut: string) {
    await updatePreferences({ translateShortcut });
  }

  async function resetPreferences() {
    config.value = {
      ...config.value,
      preferences: createDefaultPreferences(),
    };

    await persist();
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
    initialize,
    setThemeMode,
    setLocale,
    setCloseBehavior,
    setHistoryLimit,
    setGlobalShortcut,
    setTranslateShortcut,
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
