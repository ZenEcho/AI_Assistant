use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SystemInputPermissionState {
    Unknown,
    Granted,
    Denied,
    NotRequired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInputConfig {
    pub enabled: bool,
    pub translate_selection_shortcut: String,
    pub translate_clipboard_shortcut: String,
    pub paste_last_translation_shortcut: String,
    pub toggle_enabled_shortcut: String,
    pub target_language_switch_shortcut: String,
    pub source_language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SystemInputTargetApp {
    pub process_id: Option<u32>,
    pub process_name: Option<String>,
    pub bundle_id: Option<String>,
    pub app_name: Option<String>,
    pub window_title: Option<String>,
    pub window_handle: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInputStatusPayload {
    pub native_ready: bool,
    pub active: bool,
    pub platform: String,
    pub permission_state: SystemInputPermissionState,
    pub last_error: Option<String>,
}

impl Default for SystemInputConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            translate_selection_shortcut: "Ctrl+1".to_string(),
            translate_clipboard_shortcut: "Ctrl+2".to_string(),
            paste_last_translation_shortcut: "Ctrl+3".to_string(),
            toggle_enabled_shortcut: "Ctrl+4".to_string(),
            target_language_switch_shortcut: "Ctrl+`".to_string(),
            source_language: "auto".to_string(),
        }
    }
}

impl Default for SystemInputStatusPayload {
    fn default() -> Self {
        Self {
            native_ready: false,
            active: false,
            platform: std::env::consts::OS.to_string(),
            permission_state: SystemInputPermissionState::Unknown,
            last_error: None,
        }
    }
}
