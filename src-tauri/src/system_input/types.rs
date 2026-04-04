use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SystemInputTriggerMode {
    DoubleSpace,
    DoubleAlt,
    ManualHotkey,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SystemInputCaptureMode {
    SelectionFirst,
    BeforeCaretFirst,
    WholeInputFirst,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SystemInputWritebackMode {
    Auto,
    NativeReplace,
    SimulateInput,
    ClipboardPaste,
    PopupOnly,
}

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
    pub trigger_mode: SystemInputTriggerMode,
    pub double_tap_interval_ms: u64,
    pub translate_selection_shortcut: String,
    pub translate_clipboard_shortcut: String,
    pub paste_last_translation_shortcut: String,
    pub toggle_enabled_shortcut: String,
    pub app_blacklist: Vec<String>,
    pub app_whitelist: Vec<String>,
    pub source_language: String,
    pub target_language: String,
    pub only_selected_text: bool,
    pub auto_replace: bool,
    pub replace_selection_on_shortcut_translate: bool,
    pub enable_clipboard_fallback: bool,
    pub show_floating_hint: bool,
    pub only_when_english_text: bool,
    pub exclude_code_editors: bool,
    pub debug_logging: bool,
    pub capture_mode: SystemInputCaptureMode,
    pub writeback_mode: SystemInputWritebackMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInputInitPayload {
    pub config: SystemInputConfig,
    pub app_window_labels: Vec<String>,
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
pub struct SystemInputCapturedText {
    pub selected_text: Option<String>,
    pub before_caret_text: Option<String>,
    pub whole_input_text: Option<String>,
    pub preferred_text: String,
    pub preferred_strategy: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInputTranslationRequestPayload {
    pub session_id: String,
    pub trigger_mode: SystemInputTriggerMode,
    pub source_language: String,
    pub target_language: String,
    pub target_app: Option<SystemInputTargetApp>,
    pub captured_text: SystemInputCapturedText,
    pub emitted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInputSelectionCapturePayload {
    pub text: String,
    pub target_app: Option<SystemInputTargetApp>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInputTranslationSubmitPayload {
    pub session_id: String,
    pub translated_text: String,
    pub display_text: Option<String>,
    pub source_text: Option<String>,
    pub capture_strategy: Option<String>,
    pub target_app: Option<SystemInputTargetApp>,
    pub open_result_window_on_failure: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInputCancelSessionPayload {
    pub session_id: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInputWritebackResultPayload {
    pub session_id: String,
    pub success: bool,
    pub used_strategy: String,
    pub fallback_window_required: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInputStatusPayload {
    pub native_ready: bool,
    pub active: bool,
    pub platform: String,
    pub permission_state: SystemInputPermissionState,
    pub last_error: Option<String>,
    pub last_target_app: Option<SystemInputTargetApp>,
}

impl Default for SystemInputConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            trigger_mode: SystemInputTriggerMode::DoubleSpace,
            double_tap_interval_ms: 280,
            translate_selection_shortcut: "Ctrl+1".to_string(),
            translate_clipboard_shortcut: "Ctrl+2".to_string(),
            paste_last_translation_shortcut: "Ctrl+3".to_string(),
            toggle_enabled_shortcut: "Ctrl+4".to_string(),
            app_blacklist: Vec::new(),
            app_whitelist: Vec::new(),
            source_language: "auto".to_string(),
            target_language: "Chinese (Simplified)".to_string(),
            only_selected_text: false,
            auto_replace: true,
            replace_selection_on_shortcut_translate: true,
            enable_clipboard_fallback: true,
            show_floating_hint: true,
            only_when_english_text: true,
            exclude_code_editors: true,
            debug_logging: false,
            capture_mode: SystemInputCaptureMode::BeforeCaretFirst,
            writeback_mode: SystemInputWritebackMode::Auto,
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
            last_target_app: None,
        }
    }
}
