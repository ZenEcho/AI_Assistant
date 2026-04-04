export type AppLogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type AppLogCategory =
  | "app"
  | "settings"
  | "translation"
  | "provider"
  | "cache"
  | "window"
  | "shortcut"
  | "external-input"
  | "network"
  | "error"
  | "storage"
  | "debug";

export type AppLogSource =
  | "frontend"
  | "page"
  | "store"
  | "service"
  | "tauri"
  | "rust"
  | "provider"
  | "window-manager"
  | "cache"
  | "system-input";

export type AppLogVisibility = "user" | "debug";

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
  source: AppLogSource;
  action: string;
  message: string;
  detail?: Record<string, unknown> | string | null;
  context?: Record<string, unknown> | null;
  windowLabel?: string | null;
  requestId?: string | null;
  traceId?: string | null;
  relatedEntity?: AppLogRelatedEntity | null;
  success?: boolean | null;
  durationMs?: number | null;
  errorCode?: string | null;
  errorStack?: string | null;
  ingestSeq?: number;
  visibility?: AppLogVisibility;
}

export interface AppLogQuery {
  levels?: AppLogLevel[];
  categories?: AppLogCategory[];
  sources?: AppLogSource[];
  keyword?: string;
  requestId?: string;
  traceId?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
  includeDebug?: boolean;
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
  minLevel: AppLogLevel;
  persistMinLevel: AppLogLevel;
  enableVerboseDebug: boolean;
  retainDays: number;
  maxEntries: number;
  maxFileSizeMb: number;
  captureFrontendErrors: boolean;
  captureConsoleErrors: boolean;
  detailedRequestLogging: boolean;
}
