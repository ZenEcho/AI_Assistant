import { describe, expect, it } from "vitest";
import {
  APP_LOG_STACK_MAX_LENGTH,
  APP_LOG_TEXT_PREVIEW_LENGTH,
} from "@/constants/logging";
import {
  sanitizeLogRecord,
  summarizeTranslationText,
} from "@/services/logging/logSanitizer";
import type { AppLogRecord } from "@/types/log";

function createLogRecord(overrides?: Partial<AppLogRecord>): AppLogRecord {
  return {
    id: overrides?.id ?? "log-1",
    timestamp: overrides?.timestamp ?? "2026-04-04T12:00:00.000Z",
    level: overrides?.level ?? "error",
    category: overrides?.category ?? "frontend",
    tag: overrides?.tag ?? "vue-runtime",
    message: overrides?.message ?? "test message",
    detail: overrides?.detail ?? null,
    stack: overrides?.stack ?? null,
    context: overrides?.context ?? null,
    windowLabel: overrides?.windowLabel ?? "main",
    requestId: overrides?.requestId ?? null,
    traceId: overrides?.traceId ?? null,
    relatedEntity: overrides?.relatedEntity ?? null,
    success: overrides?.success ?? null,
    durationMs: overrides?.durationMs ?? null,
    errorCode: overrides?.errorCode ?? null,
    errorStack: overrides?.errorStack ?? null,
    visibility: overrides?.visibility ?? "user",
  };
}

describe("logSanitizer", () => {
  it("summarizes translation text with trimming and preview truncation", () => {
    const raw = `  ${"a".repeat(APP_LOG_TEXT_PREVIEW_LENGTH + 12)}  `;

    const summary = summarizeTranslationText(raw);

    expect(summary.length).toBe(APP_LOG_TEXT_PREVIEW_LENGTH + 12);
    expect(summary.excerpt).toBe(`${"a".repeat(APP_LOG_TEXT_PREVIEW_LENGTH)}...`);
  });

  it("masks sensitive fields, omits large blobs, and truncates oversized arrays and stacks", () => {
    const sanitized = sanitizeLogRecord(
      createLogRecord({
        detail: {
          apiKey: "abcdef1234567890",
          nested: {
            authorization: "Bearer super-secret-token",
            imageDataUrl: "data:image/png;base64,very-long-payload",
            items: Array.from({ length: 30 }, (_, index) => index),
          },
        },
        context: {
          password: "hunter2",
          fileContent: "blob-data",
        },
        stack: "x".repeat(APP_LOG_STACK_MAX_LENGTH + 10),
      }),
    );

    expect(sanitized.detail).toEqual({
      apiKey: "ab***90",
      nested: {
        authorization: "Be***en",
        imageDataUrl: "[omitted:imageDataUrl]",
        items: Array.from({ length: 20 }, (_, index) => index),
      },
    });
    expect(sanitized.context).toEqual({
      password: "***",
      fileContent: "[omitted:fileContent]",
    });
    expect(sanitized.stack).toMatch(/\.\.\. \[truncated\]$/);
  });
});
