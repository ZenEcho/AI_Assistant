use tauri::AppHandle;

pub mod platform;
pub mod state;
pub mod types;

use state::SystemInputState;
use types::{SystemInputConfig, SystemInputStatusPayload, SystemInputTargetApp};

pub fn initialize(
    app: &AppHandle,
    state: &SystemInputState,
    config: SystemInputConfig,
) -> Result<SystemInputStatusPayload, String> {
    platform::ensure_runtime_started(app)?;
    let status = platform::build_status(&config);
    state.initialize(config, status)
}

pub fn update_config(
    app: &AppHandle,
    state: &SystemInputState,
    config: SystemInputConfig,
) -> Result<SystemInputStatusPayload, String> {
    platform::ensure_runtime_started(app)?;
    let status = platform::build_status(&config);
    state.update_config(config, status)
}

pub fn get_status(state: &SystemInputState) -> Result<SystemInputStatusPayload, String> {
    Ok(state.snapshot()?.status)
}

pub fn capture_selected_text() -> Result<Option<String>, String> {
    platform::capture_selected_text()
}

pub fn read_clipboard_text() -> Result<Option<String>, String> {
    platform::read_clipboard_text()
}

pub fn paste_text(text: &str, target_app: Option<&SystemInputTargetApp>) -> Result<bool, String> {
    platform::paste_text(text, target_app)
}
