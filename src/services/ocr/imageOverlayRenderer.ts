import type { ImageTranslationRenderResult } from "@/types/ai";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderImageTranslationOverlay(input: {
  sourceImage: {
    dataUrl: string;
    mimeType?: string;
    name?: string;
    width?: number;
    height?: number;
  };
  translatedBlocks: Array<{
    blockId: string;
    sourceText: string;
    translatedText: string;
    bbox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
}): ImageTranslationRenderResult {
  const width = Math.max(1, Math.round(input.sourceImage.width ?? 1));
  const height = Math.max(1, Math.round(input.sourceImage.height ?? 1));
  const blocks = input.translatedBlocks
    .map((block) => {
      const fontSize = Math.max(12, Math.min(28, Math.floor(block.bbox.height * 0.5)));
      const textY = block.bbox.y + Math.max(fontSize, Math.floor(block.bbox.height * 0.75));
      return [
        `<rect x="${block.bbox.x}" y="${block.bbox.y}" width="${block.bbox.width}" height="${block.bbox.height}" rx="8" fill="rgba(255,255,255,0.94)" />`,
        `<text x="${block.bbox.x + 8}" y="${textY}" font-size="${fontSize}" font-family="'Microsoft YaHei', 'PingFang SC', sans-serif" fill="#111827">${escapeXml(block.translatedText)}</text>`,
      ].join("");
    })
    .join("");

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<image href="${input.sourceImage.dataUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" />`,
    blocks,
    "</svg>",
  ].join("");

  return {
    imageDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width,
    height,
  };
}
