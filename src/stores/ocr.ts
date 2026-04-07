import { ref } from "vue";
import { acceptHMRUpdate, defineStore } from "pinia";
import {
  downloadOcrEngine as downloadOcrEngineRuntime,
  listOcrEngineStatuses,
} from "@/services/ocr/nativeBridge";
import type { OcrEngineId, OcrEngineStatus } from "@/types/ocr";

const DEFAULT_ENGINE_ORDER: OcrEngineId[] = ["rapidocr", "paddleocr"];
const DOWNLOAD_POLL_INTERVAL_MS = 800;
const DOWNLOAD_POLL_LIMIT = 300;

function sortStatuses(statuses: OcrEngineStatus[]) {
  return [...statuses].sort(
    (left, right) =>
      DEFAULT_ENGINE_ORDER.indexOf(left.engineId) - DEFAULT_ENGINE_ORDER.indexOf(right.engineId),
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export const useOcrStore = defineStore("ocr", () => {
  const statuses = ref<OcrEngineStatus[]>([]);
  const initialized = ref(false);

  function upsertStatus(status: OcrEngineStatus) {
    const index = statuses.value.findIndex((item) => item.engineId === status.engineId);

    if (index >= 0) {
      statuses.value.splice(index, 1, status);
    } else {
      statuses.value.push(status);
    }

    statuses.value = sortStatuses(statuses.value);
  }

  async function refreshStatuses() {
    statuses.value = sortStatuses(await listOcrEngineStatuses());
    return statuses.value;
  }

  async function initialize() {
    if (initialized.value) {
      return;
    }

    await refreshStatuses();
    initialized.value = true;
  }

  async function downloadEngine(engineId: OcrEngineId) {
    const status = await downloadOcrEngineRuntime(engineId);
    upsertStatus(status);

    if (status.status !== "downloading" || import.meta.env.MODE === "test") {
      return status;
    }

    for (let attempt = 0; attempt < DOWNLOAD_POLL_LIMIT; attempt += 1) {
      await sleep(DOWNLOAD_POLL_INTERVAL_MS);
      await refreshStatuses();

      const nextStatus = getStatus(engineId);
      if (!nextStatus || nextStatus.status !== "downloading") {
        return nextStatus ?? status;
      }
    }

    return getStatus(engineId) ?? status;
  }

  function getStatus(engineId: OcrEngineId) {
    return statuses.value.find((item) => item.engineId === engineId) ?? null;
  }

  return {
    statuses,
    initialized,
    initialize,
    refreshStatuses,
    downloadEngine,
    getStatus,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useOcrStore, import.meta.hot));
}
