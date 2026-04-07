import { invoke, isTauri } from "@tauri-apps/api/core";
import type { TranslateRequest } from "@/types/ai";
import type { OcrEngineId, OcrEngineStatus, OcrRecognitionResult } from "@/types/ocr";

function createDefaultStatuses(): OcrEngineStatus[] {
  return [
    {
      engineId: "rapidocr",
      status: "not-installed",
      version: null,
      downloadProgress: null,
      errorMessage: null,
      installPath: null,
    },
    {
      engineId: "paddleocr",
      status: "not-installed",
      version: null,
      downloadProgress: null,
      errorMessage: null,
      installPath: null,
    },
  ];
}

export async function listOcrEngineStatuses(): Promise<OcrEngineStatus[]> {
  if (!isTauri()) {
    return createDefaultStatuses();
  }

  return await invoke<OcrEngineStatus[]>("ocr_list_engine_statuses", undefined);
}

export async function downloadOcrEngine(engineId: OcrEngineId): Promise<OcrEngineStatus> {
  if (!isTauri()) {
    return createDefaultStatuses().find((item) => item.engineId === engineId)!;
  }

  return await invoke<OcrEngineStatus>("ocr_download_engine", {
    engineId,
  });
}

export async function recognizeImageWithOcr(
  engineId: OcrEngineId,
  image: NonNullable<TranslateRequest["sourceImage"]>,
): Promise<OcrRecognitionResult> {
  return await invoke<OcrRecognitionResult>("ocr_recognize_image", {
    engineId,
    image,
  });
}
