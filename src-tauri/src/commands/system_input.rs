use tauri::{AppHandle, State};

use crate::logging::{append_backend_log, storage::AppLogState, types::AppLogRecord};
use crate::system_input::{
    self,
    state::SystemInputState,
    types::{SystemInputConfig, SystemInputStatusPayload, SystemInputTargetApp},
};

fn log_system_input_record(
    app: &AppHandle,
    log_state: &AppLogState,
    level: &str,
    action: &str,
    message: &str,
    detail: Option<serde_json::Value>,
    success: Option<bool>,
    error_stack: Option<String>,
    visibility: &str,
) {
    let _ = append_backend_log(
        app,
        log_state,
        AppLogRecord {
            id: String::new(),
            timestamp: String::new(),
            level: level.into(),
            category: "external-input".into(),
            tag: String::new(),
            source: "rust".into(),
            action: action.into(),
            message: message.into(),
            detail,
            stack: None,
            context: None,
            window_label: None,
            request_id: None,
            trace_id: None,
            related_entity: None,
            success,
            duration_ms: None,
            error_code: None,
            error_stack,
            ingest_seq: None,
            visibility: Some(visibility.into()),
        },
    );
}

#[tauri::command]
pub fn system_input_init(
    app: AppHandle,
    log_state: State<'_, AppLogState>,
    state: State<'_, SystemInputState>,
    config: SystemInputConfig,
) -> Result<SystemInputStatusPayload, String> {
    let status = match system_input::initialize(&app, &state, config) {
        Ok(status) => status,
        Err(error) => {
            log_system_input_record(
                &app,
                &log_state,
                "error",
                "system-input.init.failed",
                "快捷输入原生模块初始化失败",
                None,
                Some(false),
                Some(error.clone()),
                "user",
            );
            return Err(error);
        }
    };
    log_system_input_record(
        &app,
        &log_state,
        "info",
        "system-input.init",
        "快捷输入原生模块初始化完成",
        None,
        Some(true),
        None,
        "user",
    );
    Ok(status)
}

#[tauri::command]
pub fn system_input_update_config(
    app: AppHandle,
    log_state: State<'_, AppLogState>,
    state: State<'_, SystemInputState>,
    config: SystemInputConfig,
) -> Result<SystemInputStatusPayload, String> {
    let status = match system_input::update_config(&app, &state, config) {
        Ok(status) => status,
        Err(error) => {
            log_system_input_record(
                &app,
                &log_state,
                "error",
                "system-input.config.update.failed",
                "快捷输入原生配置更新失败",
                None,
                Some(false),
                Some(error.clone()),
                "user",
            );
            return Err(error);
        }
    };
    log_system_input_record(
        &app,
        &log_state,
        "info",
        "system-input.config.update",
        "快捷输入原生配置已更新",
        None,
        Some(true),
        None,
        "user",
    );
    Ok(status)
}

#[tauri::command]
pub fn system_input_get_status(
    app: AppHandle,
    log_state: State<'_, AppLogState>,
    state: State<'_, SystemInputState>,
) -> Result<SystemInputStatusPayload, String> {
    match system_input::get_status(&state) {
        Ok(status) => {
            log_system_input_record(
                &app,
                &log_state,
                "debug",
                "system-input.status.get",
                "快捷输入状态已读取",
                serde_json::to_value(&status).ok(),
                Some(true),
                None,
                "debug",
            );
            Ok(status)
        }
        Err(error) => {
            log_system_input_record(
                &app,
                &log_state,
                "error",
                "system-input.status.get.failed",
                "读取快捷输入状态失败",
                None,
                Some(false),
                Some(error.clone()),
                "user",
            );
            Err(error)
        }
    }
}

#[tauri::command]
pub fn system_input_capture_selected_text(
    app: AppHandle,
    log_state: State<'_, AppLogState>,
) -> Result<Option<String>, String> {
    match system_input::capture_selected_text() {
        Ok(text) => {
            log_system_input_record(
                &app,
                &log_state,
                "debug",
                "system-input.capture.selection",
                "已读取选中文本",
                Some(serde_json::json!({
                    "hasText": text.as_ref().map(|value| !value.trim().is_empty()).unwrap_or(false),
                    "textLength": text.as_ref().map(|value| value.len()).unwrap_or(0),
                })),
                Some(true),
                None,
                "debug",
            );
            Ok(text)
        }
        Err(error) => {
            log_system_input_record(
                &app,
                &log_state,
                "error",
                "system-input.capture.selection.failed",
                "读取选中文本失败",
                None,
                Some(false),
                Some(error.clone()),
                "user",
            );
            Err(error)
        }
    }
}

#[tauri::command]
pub fn system_input_read_clipboard_text(
    app: AppHandle,
    log_state: State<'_, AppLogState>,
) -> Result<Option<String>, String> {
    match system_input::read_clipboard_text() {
        Ok(text) => {
            log_system_input_record(
                &app,
                &log_state,
                "debug",
                "system-input.clipboard.read",
                "已读取剪贴板文本",
                Some(serde_json::json!({
                    "hasText": text.as_ref().map(|value| !value.trim().is_empty()).unwrap_or(false),
                    "textLength": text.as_ref().map(|value| value.len()).unwrap_or(0),
                })),
                Some(true),
                None,
                "debug",
            );
            Ok(text)
        }
        Err(error) => {
            log_system_input_record(
                &app,
                &log_state,
                "error",
                "system-input.clipboard.read.failed",
                "读取剪贴板文本失败",
                None,
                Some(false),
                Some(error.clone()),
                "user",
            );
            Err(error)
        }
    }
}

#[tauri::command]
pub fn system_input_paste_text(
    app: AppHandle,
    log_state: State<'_, AppLogState>,
    text: String,
    target_app: Option<SystemInputTargetApp>,
) -> Result<bool, String> {
    match system_input::paste_text(&text, target_app.as_ref()) {
        Ok(success) => {
            log_system_input_record(
                &app,
                &log_state,
                if success { "info" } else { "warn" },
                "system-input.paste",
                "快捷输入文本回写已执行",
                Some(serde_json::json!({
                    "success": success,
                    "textLength": text.len(),
                    "hasTargetApp": target_app.is_some(),
                })),
                Some(success),
                None,
                "user",
            );
            Ok(success)
        }
        Err(error) => {
            log_system_input_record(
                &app,
                &log_state,
                "error",
                "system-input.paste.failed",
                "快捷输入文本回写失败",
                Some(serde_json::json!({
                    "textLength": text.len(),
                    "hasTargetApp": target_app.is_some(),
                })),
                Some(false),
                Some(error.clone()),
                "user",
            );
            Err(error)
        }
    }
}
