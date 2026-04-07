import { translateText } from "@/services/ai/translationService";
import { renderImageTranslationOverlay } from "@/services/ocr/imageOverlayRenderer";
import type {
  ImageTranslationBlockResult,
  ImageTranslationProgressHandlers,
  TranslateRequest,
  TranslateResult,
} from "@/types/ai";
import type { ModelConfig } from "@/types/app";
import type { OcrEngineId } from "@/types/ocr";

function sortOcrBlocks(request: NonNullable<TranslateRequest["sourceImageOcr"]>) {
  return [...request.blocks].sort((left, right) => left.order - right.order);
}

function buildMergedOcrText(request: NonNullable<TranslateRequest["sourceImageOcr"]>) {
  return sortOcrBlocks(request)
    .map((block) => block.sourceText.trim())
    .filter(Boolean)
    .join("\n");
}

function splitTranslatedTextIntoBlockLines(text: string, blockCount: number) {
  if (blockCount === 0) {
    return [];
  }

  const normalizedText = text.replace(/\r\n/g, "\n");
  const lines = normalizedText.split("\n");

  if (lines.length === blockCount) {
    return lines;
  }

  if (lines.length > blockCount) {
    return [
      ...lines.slice(0, blockCount - 1),
      lines.slice(blockCount - 1).join("\n"),
    ];
  }

  return [...lines, ...Array.from({ length: blockCount - lines.length }, () => "")];
}

function buildTranslatedBlocks(
  request: NonNullable<TranslateRequest["sourceImageOcr"]>,
  translatedText: string,
): ImageTranslationBlockResult[] {
  const sortedBlocks = sortOcrBlocks(request);
  const translatedLines = splitTranslatedTextIntoBlockLines(translatedText, sortedBlocks.length);

  return sortedBlocks.map((block, index) => ({
    blockId: block.id,
    sourceText: block.sourceText,
    translatedText: translatedLines[index] ?? "",
    bbox: block.bbox,
  }));
}

function buildProgressPayload(
  sourceImage: NonNullable<TranslateRequest["sourceImage"]>,
  request: NonNullable<TranslateRequest["sourceImageOcr"]>,
  translatedText: string,
) {
  const blocks = buildTranslatedBlocks(request, translatedText);

  return {
    fullText: translatedText,
    blocks,
    render: renderImageTranslationOverlay({
      sourceImage,
      translatedBlocks: blocks,
    }),
  };
}

export async function translateImageWithOcr(
  modelConfig: ModelConfig,
  request: TranslateRequest,
  engineId: OcrEngineId,
  handlers?: ImageTranslationProgressHandlers,
): Promise<TranslateResult> {
  if (!request.sourceImage) {
    throw new Error("Missing source image for OCR translation.");
  }

  const sourceImage = request.sourceImage;

  const ocrResult = request.sourceImageOcr;

  if (!ocrResult) {
    throw new Error("Missing OCR data for image translation.");
  }

  if (ocrResult.engineId !== engineId) {
    throw new Error(`OCR engine mismatch: expected ${engineId}, received ${ocrResult.engineId}.`);
  }

  const mergedSourceText = buildMergedOcrText(ocrResult);
  let streamedText = "";
  const translation = await translateText(modelConfig, {
    ...request,
    sourceText: mergedSourceText,
    sourceImage: null,
    sourceImageOcr: null,
  }, {
    onTextDelta(delta) {
      if (!delta) {
        return;
      }

      streamedText += delta;
      handlers?.onTextDelta?.(delta);
      handlers?.onTextProgress?.(buildProgressPayload(sourceImage, ocrResult, streamedText));
    },
  }, undefined);
  const fullText = translation.text;
  const finalProgress = buildProgressPayload(sourceImage, ocrResult, fullText);
  const translatedBlocks = finalProgress.blocks;

  handlers?.onTextProgress?.(finalProgress);

  return {
    mode: "image",
    text: fullText,
    model: modelConfig.model,
    provider: modelConfig.provider,
    raw: null,
    imageTranslation: {
      ocr: {
        engine: {
          engineId: ocrResult.engineId,
          engineVersion: ocrResult.engineVersion,
        },
        blocks: ocrResult.blocks,
      },
      translation: {
        blocks: translatedBlocks,
        fullText,
      },
      render: finalProgress.render,
    },
  };
}
