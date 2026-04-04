import { createAIProvider } from "@/services/ai/providerFactory";
import { createLogger } from "@/services/logging/logger";
import { toErrorStack } from "@/utils/error";
import type { ChatMessage, TranslateRequest } from "@/types/ai";
import type { ModelConfig } from "@/types/app";
import type { LanguageDetectionResult } from "@/types/language";
import {
  normalizeLanguageCode,
  resolveLanguageLabel,
} from "@/constants/languages";

const logger = createLogger({
  source: "service",
  category: "translation",
});

interface DetectionPayload {
  language?: string;
  confidence?: number;
  reliable?: boolean;
  isMixed?: boolean;
}

function parseDetectionResponse(content: string): DetectionPayload | null {
  const normalized = content.trim();

  if (!normalized) {
    return null;
  }

  try {
    return JSON.parse(normalized) as DetectionPayload;
  } catch {
    const fencedMatch = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i);

    if (!fencedMatch?.[1]) {
      return null;
    }

    try {
      return JSON.parse(fencedMatch[1]) as DetectionPayload;
    } catch {
      return null;
    }
  }
}

function buildHeuristicDetection(text: string): LanguageDetectionResult | null {
  const normalizedText = text.replace(/\s+/g, " ").trim();

  if (!normalizedText) {
    return null;
  }

  const latinMatches = normalizedText.match(/[A-Za-z]/g) ?? [];
  const hanMatches = normalizedText.match(/\p{Script=Han}/gu) ?? [];
  const hiraganaMatches = normalizedText.match(/\p{Script=Hiragana}/gu) ?? [];
  const katakanaMatches = normalizedText.match(/\p{Script=Katakana}/gu) ?? [];
  const hangulMatches = normalizedText.match(/\p{Script=Hangul}/gu) ?? [];
  const cyrillicMatches = normalizedText.match(/\p{Script=Cyrillic}/gu) ?? [];
  const arabicMatches = normalizedText.match(/\p{Script=Arabic}/gu) ?? [];

  const weightedCounts = [
    { language: "ja", score: hiraganaMatches.length + katakanaMatches.length * 1.2 + hanMatches.length * 0.2 },
    { language: "ko", score: hangulMatches.length * 1.4 },
    { language: "zh", score: hanMatches.length },
    { language: "ru", score: cyrillicMatches.length * 1.2 },
    { language: "ar", score: arabicMatches.length * 1.2 },
    { language: "en", score: latinMatches.length * 0.5 },
  ] as const;

  const primary = [...weightedCounts].sort((left, right) => right.score - left.score)[0];
  const secondary = [...weightedCounts].sort((left, right) => right.score - left.score)[1];

  if (!primary || primary.score <= 0) {
    return null;
  }

  const visibleLength = latinMatches.length +
    hanMatches.length +
    hiraganaMatches.length +
    katakanaMatches.length +
    hangulMatches.length +
    cyrillicMatches.length +
    arabicMatches.length;

  const ratio = visibleLength > 0 ? primary.score / visibleLength : 0;
  const secondaryRatio = visibleLength > 0 ? secondary.score / visibleLength : 0;
  const isMixed = secondaryRatio >= 0.25;
  const isShort = normalizedText.length <= 4;
  const isNonLatinScriptLanguage = ["zh", "ja", "ko", "ru", "ar"].includes(primary.language);
  const reliable = !isMixed && ratio >= 0.6 && (!isShort || isNonLatinScriptLanguage);

  if ((primary.language === "en" && isShort) || (normalizedText.length <= 2 && !isNonLatinScriptLanguage)) {
    return {
      language: primary.language,
      confidence: Math.min(0.6, ratio || 0.4),
      reliable: false,
      isMixed,
      strategy: "heuristic",
    };
  }

  return {
    language: primary.language,
    confidence: Math.min(0.98, Math.max(0.45, ratio)),
    reliable,
    isMixed,
    strategy: "heuristic",
  };
}

function buildDetectionMessages(request: TranslateRequest): ChatMessage[] {
  const instruction = [
    "Identify the primary source language of the user's content.",
    "Return strict JSON only.",
    'Use this exact shape: {"language":"en","confidence":0.98,"reliable":true,"isMixed":false}.',
    'Allowed language values: "zh","en","ja","ko","fr","de","es","pt","ru","ar","und".',
    "If the text is too short, ambiguous, or mixed without a clear dominant language, set reliable to false.",
  ].join("\n");

  if (!request.sourceImage) {
    return [
      {
        role: "system",
        content: instruction,
      },
      {
        role: "user",
        content: `Text:\n${request.sourceText}`,
      },
    ];
  }

  const extraText = request.sourceText.trim()
    ? `\n\nAdditional plain text:\n${request.sourceText}`
    : "";

  return [
    {
      role: "system",
      content: instruction,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Inspect the image text with OCR and combine it with the additional text if present.${extraText}`,
        },
        {
          type: "image_url",
          image_url: {
            url: request.sourceImage.dataUrl,
            detail: "high",
          },
        },
      ],
    },
  ];
}

export async function detectSourceLanguage(
  modelConfig: ModelConfig,
  request: TranslateRequest,
): Promise<LanguageDetectionResult> {
  const requestedLanguageCode = normalizeLanguageCode(request.sourceLanguage);

  if (request.sourceLanguage !== "auto" && requestedLanguageCode) {
    return {
      language: requestedLanguageCode,
      confidence: 1,
      reliable: true,
      isMixed: false,
      strategy: "manual",
    };
  }

  const heuristic = buildHeuristicDetection(request.sourceText);

  if (heuristic && (heuristic.reliable || request.sourceText.trim().length <= 2)) {
    return heuristic;
  }

  try {
    const provider = createAIProvider(modelConfig);
    const response = await provider.completeChat(modelConfig, {
      messages: buildDetectionMessages(request),
    });
    const payload = parseDetectionResponse(response.content);
    const language = normalizeLanguageCode(payload?.language) ?? "und";

    return {
      language,
      confidence:
        typeof payload?.confidence === "number" && Number.isFinite(payload.confidence)
          ? Math.max(0, Math.min(1, payload.confidence))
          : heuristic?.confidence ?? 0.45,
      reliable: typeof payload?.reliable === "boolean" ? payload.reliable : language !== "und",
      isMixed: typeof payload?.isMixed === "boolean" ? payload.isMixed : Boolean(heuristic?.isMixed),
      strategy: "model",
    };
  } catch (error) {
    await logger.warn("translation.language-detect.failed", "语言检测失败，已回退启发式策略", {
      detail: {
        modelId: modelConfig.id,
      },
      errorStack: toErrorStack(error),
    });
  }

  if (heuristic) {
    return heuristic;
  }

  return {
    language: "und",
    confidence: 0,
    reliable: false,
    isMixed: false,
    strategy: "fallback",
  };
}

export function formatDetectedLanguage(result: LanguageDetectionResult | null) {
  if (!result) {
    return "未知";
  }

  return result.language === "und"
    ? "未知"
    : resolveLanguageLabel(result.language);
}
