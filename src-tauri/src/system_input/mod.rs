use tauri::AppHandle;

pub mod capture;
pub mod detector;
pub mod platform;
pub mod state;
pub mod types;
pub mod writeback;

use state::SystemInputState;
use types::{
    SystemInputCancelSessionPayload, SystemInputConfig, SystemInputInitPayload,
    SystemInputSelectionCapturePayload, SystemInputStatusPayload, SystemInputTargetApp,
    SystemInputTranslationSubmitPayload, SystemInputWritebackResultPayload,
};

pub fn initialize(
    app: &AppHandle,
    state: &SystemInputState,
    payload: SystemInputInitPayload,
) -> Result<SystemInputStatusPayload, String> {
    platform::ensure_runtime_started(app)?;
    let status = platform::build_status(&payload.config);
    let _ = detector::detector_ready(&payload.config);
    let _ = capture::capture_preview(&payload.config);
    state.initialize(payload, status)
}

pub fn update_config(
    app: &AppHandle,
    state: &SystemInputState,
    config: SystemInputConfig,
) -> Result<SystemInputStatusPayload, String> {
    platform::ensure_runtime_started(app)?;
    let status = platform::build_status(&config);
    let _ = detector::detector_ready(&config);
    let _ = capture::capture_preview(&config);
    state.update_config(config, status)
}

pub fn get_status(state: &SystemInputState) -> Result<SystemInputStatusPayload, String> {
    Ok(state.snapshot()?.status)
}

pub fn capture_selected_text() -> Result<Option<String>, String> {
    platform::capture_selected_text()
}

pub fn capture_selected_text_with_context(
) -> Result<Option<SystemInputSelectionCapturePayload>, String> {
    platform::capture_selected_text_with_context()
}

pub fn read_clipboard_text() -> Result<Option<String>, String> {
    platform::read_clipboard_text()
}

pub fn paste_text(text: &str, target_app: Option<&SystemInputTargetApp>) -> Result<bool, String> {
    platform::paste_text(text, target_app)
}

pub fn submit_translation(
    state: &SystemInputState,
    payload: &SystemInputTranslationSubmitPayload,
) -> Result<SystemInputWritebackResultPayload, String> {
    let runtime = state.snapshot()?;

    if runtime.active_session_id.as_deref() != Some(payload.session_id.as_str()) {
        return Ok(SystemInputWritebackResultPayload {
            session_id: payload.session_id.clone(),
            success: false,
            used_strategy: "noop".to_string(),
            fallback_window_required: false,
            error: Some("系统输入增强会话已失效，已忽略过期回写。".to_string()),
        });
    }

    let result = writeback::write_translation(
        &runtime.config,
        payload,
        runtime.status.last_target_app.as_ref(),
    );
    state.submit_translation(payload, result)
}

pub fn cancel_session(
    state: &SystemInputState,
    payload: &SystemInputCancelSessionPayload,
) -> Result<(), String> {
    state.cancel_session(payload)
}
