pub mod storage;
pub mod types;

use chrono::Utc;
use tauri::{AppHandle, Emitter, State};

use self::{
    storage::{append_log, cleanup_logs, clear_logs, export_logs, query_logs, AppLogRuntimeConfig, AppLogState},
    types::{AppLogExportOptions, AppLogExportResult, AppLogQuery, AppLogRecord, AppLogRuntimeConfigPayload},
};

pub const APP_LOG_EVENT: &str = "app-log:created";

fn finalize_record(state: &AppLogState, mut record: AppLogRecord) -> AppLogRecord {
    let next_seq = state.next_seq();

    if record.id.trim().is_empty() {
        record.id = format!(
            "rust-log-{}-{}",
            Utc::now().timestamp_millis(),
            next_seq
        );
    }

    if record.timestamp.trim().is_empty() {
        record.timestamp = Utc::now().to_rfc3339();
    }

    record.ingest_seq = Some(record.ingest_seq.unwrap_or(next_seq));
    record
}

pub fn append_backend_log(
    app: &AppHandle,
    state: &AppLogState,
    record: AppLogRecord,
) -> Result<AppLogRecord, String> {
    let payload = finalize_record(state, record);
    append_log(app, &payload)?;
    cleanup_logs(app, &state.config()?)?;
    let _ = app.emit(APP_LOG_EVENT, payload.clone());
    Ok(payload)
}

#[tauri::command]
pub fn app_log_append(
    app: AppHandle,
    state: State<'_, AppLogState>,
    payload: AppLogRecord,
) -> Result<AppLogRecord, String> {
    append_backend_log(&app, &state, payload)
}

#[tauri::command]
pub fn app_log_query(app: AppHandle, query: AppLogQuery) -> Result<Vec<AppLogRecord>, String> {
    query_logs(&app, &query)
}

#[tauri::command]
pub fn app_log_clear(app: AppHandle) -> Result<(), String> {
    clear_logs(&app)
}

#[tauri::command]
pub fn app_log_export(
    app: AppHandle,
    options: AppLogExportOptions,
) -> Result<AppLogExportResult, String> {
    export_logs(&app, &options)
}

#[tauri::command]
pub fn app_log_update_config(
    app: AppHandle,
    state: State<'_, AppLogState>,
    payload: AppLogRuntimeConfigPayload,
) -> Result<(), String> {
    let runtime_config = AppLogRuntimeConfig {
        retain_days: payload.retain_days.clamp(1, 90) as i64,
        max_entries: payload.max_entries.clamp(200, 100_000),
        max_total_bytes: (payload.max_file_size_mb.clamp(1, 200) as u64) * 1024 * 1024,
    };

    state.update_config(runtime_config.clone())?;
    cleanup_logs(&app, &runtime_config)
}
