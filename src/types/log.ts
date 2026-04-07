export type AppLogLevel = "info" | "warn" | "error";

export type AppLogCategory = "frontend" | "desktop" | "backend";

export interface AppLogRelatedEntity {
  type: string;
  id?: string;
  name?: string;
}

export interface AppLogRecord {
  id: string;
  timestamp: string;
  level: AppLogLevel;
  category: AppLogCategory;
  tag: string;
  message: string;
  detail?: Record<string, unknown> | string | null;
  stack?: string | null;
  ingestSeq?: number;

  // Legacy compatibility fields kept to reduce rewrite scope.
  source?: string | null;
  action?: string | null;
  context?: Record<string, unknown> | null;
  windowLabel?: string | null;
  requestId?: string | null;
  traceId?: string | null;
  relatedEntity?: AppLogRelatedEntity | null;
  success?: boolean | null;
  durationMs?: number | null;
  errorCode?: string | null;
  errorStack?: string | null;
  visibility?: string;
}

export interface AppLogQuery {
  levels?: AppLogLevel[];
  categories?: AppLogCategory[];
  tags?: string[];
  keyword?: string;
  limit?: number;
}

export interface AppLogExportOptions extends AppLogQuery {
  format: "json" | "txt";
}

export interface AppLogExportResult {
  path: string;
  count: number;
}

export interface LoggingPreferences {
  enabled: boolean;
  retainDays: number;
  maxEntries: number;
  maxFileSizeMb: number;
  captureFrontendErrors: boolean;
  captureConsoleErrors: boolean;
  detailedRequestLogging: boolean;
}
