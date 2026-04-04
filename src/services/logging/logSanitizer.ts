import {
  APP_LOG_DETAIL_MAX_LENGTH,
  APP_LOG_STACK_MAX_LENGTH,
  APP_LOG_TEXT_PREVIEW_LENGTH,
} from "@/constants/logging";
import type { AppLogRecord } from "@/types/log";

const SENSITIVE_KEY_PATTERN = /api[-_]?key|token|authorization|cookie|password|secret/i;
const LARGE_BLOB_KEY_PATTERN = /base64|dataurl|image|file|attachment/i;

function maskSensitiveValue(value: string) {
  if (value.length <= 8) {
    return "***";
  }

  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function summarizeText(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  return trimmed.length > APP_LOG_TEXT_PREVIEW_LENGTH
    ? `${trimmed.slice(0, APP_LOG_TEXT_PREVIEW_LENGTH)}...`
    : trimmed;
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}... [truncated]` : value;
}

function sanitizeValue(key: string, value: unknown, path: string[] = []): unknown {
  if (value == null) {
    return value;
  }

  const currentKey = [...path, key].filter(Boolean).join(".");

  if (typeof value === "string") {
    if (SENSITIVE_KEY_PATTERN.test(currentKey)) {
      return maskSensitiveValue(value);
    }

    if (LARGE_BLOB_KEY_PATTERN.test(currentKey)) {
      return `[omitted:${key}]`;
    }

    return truncateText(value, APP_LOG_DETAIL_MAX_LENGTH);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(key, item, path));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeValue(entryKey, entryValue, [...path, key]),
      ]),
    );
  }

  return String(value);
}

export function summarizeTranslationText(text: string) {
  const trimmed = text.trim();

  return {
    excerpt: summarizeText(trimmed),
    length: trimmed.length,
  };
}

export function sanitizeLogRecord(record: AppLogRecord): AppLogRecord {
  return {
    ...record,
    detail:
      typeof record.detail === "string"
        ? truncateText(record.detail, APP_LOG_DETAIL_MAX_LENGTH)
        : record.detail
          ? (sanitizeValue("detail", record.detail) as Record<string, unknown>)
          : record.detail,
    context: record.context
      ? (sanitizeValue("context", record.context) as Record<string, unknown>)
      : record.context,
    errorStack: record.errorStack
      ? truncateText(record.errorStack, APP_LOG_STACK_MAX_LENGTH)
      : record.errorStack,
  };
}
