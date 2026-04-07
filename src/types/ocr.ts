export type OcrEngineId = "rapidocr" | "paddleocr";

export type OcrEngineInstallStatus =
  | "not-installed"
  | "downloading"
  | "installed"
  | "failed";

export interface OcrEngineStatus {
  engineId: OcrEngineId;
  status: OcrEngineInstallStatus;
  version: string | null;
  downloadProgress: number | null;
  errorMessage: string | null;
}

export interface OcrBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type OcrPolygon = [[number, number], [number, number], [number, number], [number, number]];

export interface OcrTextBlock {
  id: string;
  order: number;
  sourceText: string;
  score: number;
  box: OcrPolygon;
  bbox: OcrBoundingBox;
}

export interface OcrRecognitionResult {
  engineId: OcrEngineId;
  engineVersion: string;
  imageWidth: number;
  imageHeight: number;
  blocks: OcrTextBlock[];
}
