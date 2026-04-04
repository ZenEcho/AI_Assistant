use tauri::{AppHandle, Emitter, State};

use crate::system_input::{
    self,
    state::SystemInputState,
    types::{
        SystemInputCancelSessionPayload, SystemInputConfig, SystemInputInitPayload,
        SystemInputSelectionCapturePayload, SystemInputStatusPayload, SystemInputTargetApp,
        SystemInputTranslationSubmitPayload, SystemInputWritebackResultPayload,
    },
};
use crate::logging::{
    append_backend_log,
    storage::AppLogState,
    types::AppLogRecord,
};

pub const SYSTEM_INPUT_STATUS_EVENT: &str = "system-input:status";
pub const SYSTEM_INPUT_TRANSLATION_REQUEST_EVENT: &str = "system-input:translation-request";
pub const SYSTEM_INPUT_WRITEBACK_RESULT_EVENT: &str = "system-input:writeback-result";

fn log_system_input_record(
    app: &AppHandle,
    log_state: &AppLogState,
    level: &str,
    action: &str,
    message: &str,
    detail: Option<serde_json::Value>,
    request_id: Option<String>,
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
            source: "rust".into(),
            action: action.into(),
            message: message.into(),
            detail,
            context: None,
            window_label: None,
            request_id,
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
    payload: SystemInputInitPayload,
) -> Result<SystemInputStatusPayload, String> {
    let status = match system_input::initialize(&app, &state, payload) {
        Ok(status) => status,
        Err(error) => {
            log_system_input_record(
                &app,
                &log_state,
                "error",
                "system-input.init.failed",
                "系统输入原生模块初始化失败",
                None,
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
        "系统输入原生模块初始化完成",
        None,
        None,
        Some(true),
        None,
        "user",
    );
    let _ = app.emit(SYSTEM_INPUT_STATUS_EVENT, status.clone());
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
                "系统输入原生配置更新失败",
                None,
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
        "系统输入原生配置已更新",
        None,
        None,
        Some(true),
        None,
        "user",
    );
    let _ = app.emit(SYSTEM_INPUT_STATUS_EVENT, status.clone());
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
                "系统输入状态已读取",
                serde_json::to_value(&status).ok(),
                None,
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
                "读取系统输入状态失败",
                None,
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
                None,
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
pub fn system_input_capture_selected_text_with_context(
    app: AppHandle,
    log_state: State<'_, AppLogState>,
) -> Result<Option<SystemInputSelectionCapturePayload>, String> {
    match system_input::capture_selected_text_with_context() {
        Ok(payload) => {
            log_system_input_record(
                &app,
                &log_state,
                "debug",
                "system-input.capture.selection-context",
                "已读取带上下文的选中文本",
                Some(serde_json::json!({
                    "hasText": payload.as_ref().map(|value| !value.text.trim().is_empty()).unwrap_or(false),
                    "textLength": payload.as_ref().map(|value| value.text.len()).unwrap_or(0),
                    "hasTargetApp": payload.as_ref().map(|value| value.target_app.is_some()).unwrap_or(false),
                })),
                None,
                Some(true),
                None,
                "debug",
            );
            Ok(payload)
        }
        Err(error) => {
            log_system_input_record(
                &app,
                &log_state,
                "error",
                "system-input.capture.selection-context.failed",
                "读取带上下文的选中文本失败",
                None,
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
                None,
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
                "系统输入文本回写已执行",
                Some(serde_json::json!({
                    "success": success,
                    "textLength": text.len(),
                    "hasTargetApp": target_app.is_some(),
                })),
                None,
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
                "系统输入文本回写失败",
                Some(serde_json::json!({
                    "textLength": text.len(),
                    "hasTargetApp": target_app.is_some(),
                })),
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
pub fn system_input_submit_translation(
    app: AppHandle,
    log_state: State<'_, AppLogState>,
    state: State<'_, SystemInputState>,
    payload: SystemInputTranslationSubmitPayload,
) -> Result<SystemInputWritebackResultPayload, String> {
    let result = match system_input::submit_translation(&state, &payload) {
        Ok(result) => result,
        Err(error) => {
            log_system_input_record(
                &app,
                &log_state,
                "error",
                "system-input.translation.submit.failed",
                "系统输入译文回写执行失败",
                Some(serde_json::json!({
                    "sessionId": payload.session_id,
                })),
                Some(payload.session_id.clone()),
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
        if result.success { "info" } else { "warn" },
        "system-input.translation.submit",
        "系统输入译文回写已执行",
        serde_json::to_value(&result).ok(),
        Some(result.session_id.clone()),
        Some(result.success),
        result.error.clone(),
        "user",
    );
    let _ = app.emit(SYSTEM_INPUT_WRITEBACK_RESULT_EVENT, result.clone());
    let status = system_input::get_status(&state)?;
    let _ = app.emit(SYSTEM_INPUT_STATUS_EVENT, status);
    Ok(result)
}

#[tauri::command]
pub fn system_input_cancel_session(
    app: AppHandle,
    log_state: State<'_, AppLogState>,
    state: State<'_, SystemInputState>,
    payload: SystemInputCancelSessionPayload,
) -> Result<(), String> {
    if let Err(error) = system_input::cancel_session(&state, &payload) {
        log_system_input_record(
            &app,
            &log_state,
            "error",
            "system-input.session.cancel.failed",
            "取消系统输入会话失败",
            Some(serde_json::json!({
                "sessionId": payload.session_id,
            })),
            Some(payload.session_id.clone()),
            Some(false),
            Some(error.clone()),
            "user",
        );
        return Err(error);
    }
    log_system_input_record(
        &app,
        &log_state,
        "info",
        "system-input.session.cancel",
        "系统输入会话已取消",
        Some(serde_json::json!({
            "sessionId": payload.session_id,
            "hasError": payload.error.as_ref().map(|value| !value.trim().is_empty()).unwrap_or(false),
        })),
        Some(payload.session_id.clone()),
        Some(true),
        payload.error.clone(),
        "user",
    );
    let status = system_input::get_status(&state)?;
    let _ = app.emit(SYSTEM_INPUT_STATUS_EVENT, status);
    Ok(())
}
