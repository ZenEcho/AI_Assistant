use std::{
    collections::HashMap,
    env,
    fs::{self, OpenOptions},
    io::Write,
    mem::size_of,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex, OnceLock,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use arboard::Clipboard;
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager};
use uiautomation::{
    patterns::{UITextPattern, UITextRange, UIValuePattern},
    types::{ControlType, TextPatternRangeEndpoint},
    UIAutomation, UIElement,
};
use windows::core::PWSTR;
use windows::Win32::{
    Foundation::{CloseHandle, HINSTANCE, HWND, LPARAM, LRESULT, WPARAM},
    System::{
        DataExchange::GetClipboardSequenceNumber,
        LibraryLoader::GetModuleHandleW,
        Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
            PROCESS_QUERY_LIMITED_INFORMATION,
        },
    },
    UI::{
        Input::KeyboardAndMouse::{
            GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT,
            KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, VIRTUAL_KEY, VK_CONTROL,
            VK_DELETE, VK_HOME, VK_LMENU, VK_RMENU, VK_SHIFT, VK_SPACE,
        },
        WindowsAndMessaging::{
            CallNextHookEx, DispatchMessageW, GetForegroundWindow, GetMessageW, GetWindowTextW,
            GetWindowThreadProcessId, SetWindowsHookExW, TranslateMessage, HC_ACTION,
            KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYUP, WM_SYSKEYUP,
        },
    },
};

use crate::{
    commands::system_input::{SYSTEM_INPUT_STATUS_EVENT, SYSTEM_INPUT_TRANSLATION_REQUEST_EVENT},
    system_input::{
        state::SystemInputState,
        types::{
            SystemInputCaptureMode, SystemInputCapturedText, SystemInputConfig,
            SystemInputPermissionState, SystemInputSelectionCapturePayload,
            SystemInputStatusPayload, SystemInputTargetApp, SystemInputTranslationRequestPayload,
            SystemInputTriggerMode,
        },
    },
};

static LISTENER_STARTED: AtomicBool = AtomicBool::new(false);
static SMOKE_TRIGGER_WATCHER_STARTED: AtomicBool = AtomicBool::new(false);
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static DETECTOR_STATE: OnceLock<Mutex<DetectorState>> = OnceLock::new();
static PROCESS_NAME_CACHE: OnceLock<Mutex<HashMap<u32, Option<String>>>> = OnceLock::new();

const VK_A_KEY: VIRTUAL_KEY = VIRTUAL_KEY(0x41);
const VK_C_KEY: VIRTUAL_KEY = VIRTUAL_KEY(0x43);
const VK_V_KEY: VIRTUAL_KEY = VIRTUAL_KEY(0x56);
const SMOKE_TRIGGER_FILE_ENV: &str = "AI_ASSISTANT_SYSTEM_INPUT_SMOKE_TRIGGER_FILE";
const SMOKE_LOG_FILE_ENV: &str = "AI_ASSISTANT_SYSTEM_INPUT_SMOKE_LOG_FILE";

#[derive(Default)]
struct DetectorState {
    last_alt_up: Option<Instant>,
    last_space_up: Option<Instant>,
}

#[derive(Debug, Clone, Copy)]
enum CaptureStrategy {
    ExistingSelection,
    BeforeCaretSelection,
    WholeInputSelection,
}

#[derive(Debug, Clone)]
struct CaptureOutcome {
    selected_text: Option<String>,
    before_caret_text: Option<String>,
    whole_input_text: Option<String>,
    preferred_text: String,
    preferred_strategy: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SmokeTriggerRequest {
    request_id: String,
}

#[derive(Debug, Default)]
struct WritebackTextContext {
    raw_selection_text: Option<String>,
    raw_document_text: Option<String>,
}

pub fn ensure_runtime_started(app: &AppHandle) -> Result<(), String> {
    let _ = APP_HANDLE.get_or_init(|| app.clone());

    if LISTENER_STARTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(());
    }

    thread::Builder::new()
        .name("system-input-keyboard-hook".to_string())
        .spawn(move || {
            if let Err(error) = run_keyboard_listener() {
                LISTENER_STARTED.store(false, Ordering::SeqCst);

                if let Some(app_handle) = APP_HANDLE.get() {
                    let managed_state = app_handle.state::<SystemInputState>();
                    let _ = managed_state.set_last_error(Some(error));
                    let _ = emit_status(app_handle);
                }
            }
        })
        .map_err(|error| format!("failed to spawn keyboard listener thread: {error}"))?;

    log_smoke_message("keyboard listener runtime started");
    maybe_start_smoke_trigger_watcher(app)?;

    Ok(())
}

pub fn build_status(config: &SystemInputConfig) -> SystemInputStatusPayload {
    let native_ready = LISTENER_STARTED.load(Ordering::SeqCst);
    let stage_one_notice = config.enabled
        && !config.only_selected_text
        && matches!(
            config.capture_mode,
            SystemInputCaptureMode::BeforeCaretFirst | SystemInputCaptureMode::WholeInputFirst
        );

    let status = SystemInputStatusPayload {
        native_ready,
        active: native_ready && config.enabled,
        platform: "windows".to_string(),
        permission_state: SystemInputPermissionState::NotRequired,
        last_error: if config.enabled && stage_one_notice {
            Some(
                "Windows 会优先尝试 UI Automation 获取文本，失败后回退到键盘/剪贴板策略；复杂编辑器仍可能回退到结果窗口。"
                    .to_string(),
            )
        } else {
            None
        },
        last_target_app: None,
    };

    log_smoke_message(&format!(
        "build_status: enabled={}, native_ready={}, active={}, trigger_mode={:?}, capture_mode={:?}, writeback_mode={:?}",
        config.enabled,
        status.native_ready,
        status.active,
        config.trigger_mode,
        config.capture_mode,
        config.writeback_mode
    ));

    status
}

pub fn capture_selected_text() -> Result<Option<String>, String> {
    let Some(target_app) = current_target_app() else {
        return Ok(None);
    };

    if target_app.process_id == Some(std::process::id()) {
        return Ok(None);
    }

    let mut config = SystemInputConfig::default();
    config.trigger_mode = SystemInputTriggerMode::ManualHotkey;

    capture_text_by_keyboard_strategy(CaptureStrategy::ExistingSelection, &config)
}

pub fn capture_selected_text_with_context(
) -> Result<Option<SystemInputSelectionCapturePayload>, String> {
    let Some(target_app) = current_target_app() else {
        return Ok(None);
    };

    if target_app.process_id == Some(std::process::id()) {
        return Ok(None);
    }

    let mut config = SystemInputConfig::default();
    config.trigger_mode = SystemInputTriggerMode::ManualHotkey;

    let captured_text =
        capture_text_by_keyboard_strategy(CaptureStrategy::ExistingSelection, &config)?;

    Ok(
        captured_text.map(|text| SystemInputSelectionCapturePayload {
            text,
            target_app: Some(target_app),
        }),
    )
}

pub fn read_clipboard_text() -> Result<Option<String>, String> {
    let mut clipboard =
        Clipboard::new().map_err(|error| format!("failed to access clipboard: {error}"))?;

    Ok(clipboard
        .get_text()
        .ok()
        .map(|text| normalize_captured_text(&text, &SystemInputTriggerMode::ManualHotkey))
        .filter(|text| !text.is_empty()))
}

pub fn paste_text(text: &str, target_app: Option<&SystemInputTargetApp>) -> Result<bool, String> {
    if text.trim().is_empty() {
        return Ok(false);
    }

    paste_clipboard_text(text, target_app)
}

pub fn try_clipboard_writeback(
    translated_text: &str,
    target_app: Option<&SystemInputTargetApp>,
) -> Result<bool, String> {
    let Some(expected_target) = target_app else {
        return Ok(false);
    };

    let Some(current_target) = current_target_app() else {
        return Ok(false);
    };

    if !target_app_matches(expected_target, &current_target) {
        return Ok(false);
    }

    paste_clipboard_text(translated_text, Some(expected_target))
}

pub fn try_native_writeback(
    translated_text: &str,
    source_text: Option<&str>,
    capture_strategy: Option<&str>,
    target_app: Option<&SystemInputTargetApp>,
) -> Result<bool, String> {
    let normalized_source = normalized_writeback_source(source_text);
    let Some(source_text) = normalized_source.as_deref() else {
        return Ok(false);
    };

    let Some(element) = resolve_writeback_element(target_app)? else {
        return Ok(false);
    };

    let value_pattern = match element.get_pattern::<UIValuePattern>() {
        Ok(pattern) => pattern,
        Err(_) => return Ok(false),
    };

    if value_pattern.is_readonly().unwrap_or(true) {
        return Ok(false);
    }

    let context = read_writeback_text_context(&element);
    let replacement_text = build_native_replacement_text(
        translated_text,
        source_text,
        capture_strategy.unwrap_or_default(),
        &context,
    );

    let Some(replacement_text) = replacement_text else {
        return Ok(false);
    };

    value_pattern
        .set_value(&replacement_text)
        .map_err(|error| format!("failed to write back via ValuePattern: {error}"))?;

    Ok(true)
}

pub fn try_simulated_writeback(
    translated_text: &str,
    source_text: Option<&str>,
    capture_strategy: Option<&str>,
    target_app: Option<&SystemInputTargetApp>,
) -> Result<bool, String> {
    let normalized_source = normalized_writeback_source(source_text);
    let Some(source_text) = normalized_source.as_deref() else {
        return Ok(false);
    };

    let Some(expected_target) = target_app else {
        return Ok(false);
    };

    let Some(current_target) = current_target_app() else {
        return Ok(false);
    };

    if !target_app_matches(expected_target, &current_target) {
        return Ok(false);
    }

    let element = resolve_writeback_element(target_app)?;
    let strategy = capture_strategy.unwrap_or_default();
    let mut context = element
        .as_ref()
        .map(read_writeback_text_context)
        .unwrap_or_default();

    if !selection_matches_source(&context, source_text) {
        match strategy {
            "before-caret-first" => {
                send_key_combo(VK_SHIFT, VK_HOME)?;
                thread::sleep(Duration::from_millis(35));
            }
            "whole-input-first" => {
                send_key_combo(VK_CONTROL, VK_A_KEY)?;
                thread::sleep(Duration::from_millis(35));
            }
            "selection-first" => return Ok(false),
            _ => return Ok(false),
        }

        if let Some(element) = element.as_ref() {
            context = read_writeback_text_context(element);
            if !selection_matches_source(&context, source_text)
                && !matches!(strategy, "whole-input-first")
            {
                return Ok(false);
            }
        }
    }

    send_key(VK_DELETE)?;
    thread::sleep(Duration::from_millis(25));
    send_unicode_text(translated_text)?;

    Ok(true)
}

fn detector_state() -> &'static Mutex<DetectorState> {
    DETECTOR_STATE.get_or_init(|| Mutex::new(DetectorState::default()))
}

fn paste_clipboard_text(
    text: &str,
    expected_target: Option<&SystemInputTargetApp>,
) -> Result<bool, String> {
    let Some(target_app) = current_target_app() else {
        return Ok(false);
    };

    if target_app.process_id == Some(std::process::id()) {
        return Ok(false);
    }

    if let Some(expected_target) = expected_target {
        if !target_app_matches(expected_target, &target_app) {
            return Ok(false);
        }
    }

    let mut clipboard =
        Clipboard::new().map_err(|error| format!("failed to access clipboard: {error}"))?;
    let original_text = clipboard.get_text().ok();
    clipboard
        .set_text(text.to_string())
        .map_err(|error| format!("failed to update clipboard text: {error}"))?;

    let send_result = send_key_combo(VK_CONTROL, VK_V_KEY);
    thread::sleep(Duration::from_millis(120));

    if let Some(original_text) = original_text {
        let mut restore_clipboard =
            Clipboard::new().map_err(|error| format!("failed to reopen clipboard: {error}"))?;
        let _ = restore_clipboard.set_text(original_text);
    }

    send_result.map(|_| true)
}

fn maybe_start_smoke_trigger_watcher(app: &AppHandle) -> Result<(), String> {
    let Ok(trigger_file) = env::var(SMOKE_TRIGGER_FILE_ENV) else {
        return Ok(());
    };

    if trigger_file.trim().is_empty() {
        return Ok(());
    }

    if SMOKE_TRIGGER_WATCHER_STARTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(());
    }

    let trigger_path = PathBuf::from(trigger_file);
    let app_handle = app.clone();

    thread::Builder::new()
        .name("system-input-smoke-trigger".to_string())
        .spawn(move || {
            log_smoke_message(&format!(
                "smoke watcher started: {}",
                trigger_path.display()
            ));
            let mut last_processed_request_id = String::new();

            loop {
                match fs::read_to_string(&trigger_path) {
                    Ok(raw) => {
                        let payload = raw.trim_start_matches('\u{feff}').trim();
                        if payload.is_empty() {
                            thread::sleep(Duration::from_millis(150));
                            continue;
                        }

                        match serde_json::from_str::<SmokeTriggerRequest>(payload) {
                            Ok(request)
                                if !request.request_id.is_empty()
                                    && request.request_id != last_processed_request_id =>
                            {
                                last_processed_request_id = request.request_id.clone();
                                let _ = fs::remove_file(&trigger_path);
                                log_smoke_message(&format!(
                                    "received smoke trigger: {}",
                                    request.request_id
                                ));
                                trigger_from_smoke(app_handle.clone(), request.request_id);
                            }
                            Ok(_) => {}
                            Err(error) => {
                                log_smoke_message(&format!(
                                    "failed to parse smoke trigger payload: {error}"
                                ));
                            }
                        }
                    }
                    Err(_) => {}
                }

                thread::sleep(Duration::from_millis(150));
            }
        })
        .map_err(|error| format!("failed to spawn smoke trigger watcher thread: {error}"))?;

    Ok(())
}

fn log_smoke_message(message: &str) {
    let Ok(log_file) = env::var(SMOKE_LOG_FILE_ENV) else {
        return;
    };

    if log_file.trim().is_empty() {
        return;
    }

    let timestamp = current_timestamp_string();
    let line = format!("[{timestamp}] {message}\n");

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_file) {
        let _ = file.write_all(line.as_bytes());
    }
}

fn trigger_from_smoke(app_handle: AppHandle, request_id: String) {
    let Some(target_app) = current_target_app() else {
        log_smoke_message("smoke trigger ignored: no foreground target app");
        let managed_state = app_handle.state::<SystemInputState>();
        let _ = managed_state.set_last_error(Some(
            "Smoke trigger ignored because no foreground target app was detected.".to_string(),
        ));
        let _ = emit_status(&app_handle);
        return;
    };

    if try_start_trigger_session(&app_handle, target_app.clone()) {
        log_smoke_message(&format!(
            "smoke trigger accepted for target: pid={:?}, process={:?}, window={:?}, requestId={request_id}",
            target_app.process_id, target_app.process_name, target_app.window_title
        ));
    } else {
        log_smoke_message(&format!(
            "smoke trigger ignored after eligibility checks: pid={:?}, process={:?}, window={:?}, requestId={request_id}",
            target_app.process_id, target_app.process_name, target_app.window_title
        ));
    }
}

fn try_start_trigger_session(app_handle: &AppHandle, target_app: SystemInputTargetApp) -> bool {
    let managed_state = app_handle.state::<SystemInputState>();
    let Ok(snapshot) = managed_state.snapshot() else {
        log_smoke_message("trigger rejected: failed to snapshot system input state");
        return false;
    };

    if !snapshot.config.enabled {
        log_smoke_message("trigger rejected: system input is disabled in runtime config");
        return false;
    }

    if snapshot.active_session_id.is_some() {
        log_smoke_message("trigger rejected: an active session is already in progress");
        return false;
    }

    if target_app.process_id == Some(std::process::id()) {
        log_smoke_message(
            "trigger rejected: foreground target belongs to the AI Assistant process",
        );
        return false;
    }

    if !matches_app_filters(&snapshot.config, &target_app) {
        log_smoke_message(&format!(
            "trigger rejected: target app did not pass whitelist/blacklist filters; process={:?}, title={:?}",
            target_app.process_name, target_app.window_title
        ));
        return false;
    }

    if is_excluded_code_editor(&snapshot.config, &target_app) {
        log_smoke_message(&format!(
            "trigger rejected: target app matched code editor exclusion; process={:?}, title={:?}",
            target_app.process_name, target_app.window_title
        ));
        return false;
    }

    let session_id = build_session_id();

    if managed_state
        .begin_session(session_id.clone(), Some(target_app.clone()))
        .ok()
        != Some(true)
    {
        log_smoke_message("trigger rejected: begin_session returned false");
        return false;
    }

    let _ = emit_status(app_handle);

    let app_handle = app_handle.clone();
    thread::spawn(move || {
        process_trigger(app_handle, session_id, target_app);
    });

    true
}

fn run_keyboard_listener() -> Result<(), String> {
    let module_handle = unsafe { GetModuleHandleW(None) }
        .map_err(|error| format!("failed to get module handle: {error}"))?;
    let hook = unsafe {
        SetWindowsHookExW(
            WH_KEYBOARD_LL,
            Some(keyboard_hook_proc),
            Some(HINSTANCE(module_handle.0)),
            0,
        )
    }
    .map_err(|error| format!("failed to install low-level keyboard hook: {error}"))?;

    let mut message = MSG::default();

    while unsafe { GetMessageW(&mut message, None, 0, 0) }.as_bool() {
        unsafe {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }

    let _ = unsafe { windows::Win32::UI::WindowsAndMessaging::UnhookWindowsHookEx(hook) };
    Ok(())
}

unsafe extern "system" fn keyboard_hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code != HC_ACTION as i32 {
        return unsafe { CallNextHookEx(None, code, wparam, lparam) };
    }

    let hook_struct = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
    if hook_struct.flags.0 & 0x10 != 0 {
        return unsafe { CallNextHookEx(None, code, wparam, lparam) };
    }

    let message = wparam.0 as u32;
    let is_key_up = message == WM_KEYUP || message == WM_SYSKEYUP;

    if !is_key_up {
        return unsafe { CallNextHookEx(None, code, wparam, lparam) };
    }

    let Some(app_handle) = APP_HANDLE.get() else {
        return unsafe { CallNextHookEx(None, code, wparam, lparam) };
    };

    let managed_state = app_handle.state::<SystemInputState>();
    let Ok(snapshot) = managed_state.snapshot() else {
        return unsafe { CallNextHookEx(None, code, wparam, lparam) };
    };

    if !snapshot.config.enabled || snapshot.active_session_id.is_some() {
        return unsafe { CallNextHookEx(None, code, wparam, lparam) };
    }

    let Some(target_app) = current_target_app() else {
        return unsafe { CallNextHookEx(None, code, wparam, lparam) };
    };

    if target_app.process_id == Some(std::process::id()) {
        return unsafe { CallNextHookEx(None, code, wparam, lparam) };
    }

    if !matches_app_filters(&snapshot.config, &target_app)
        || is_excluded_code_editor(&snapshot.config, &target_app)
    {
        return unsafe { CallNextHookEx(None, code, wparam, lparam) };
    }

    if !should_trigger(
        snapshot.config.trigger_mode.clone(),
        hook_struct.vkCode,
        snapshot.config.double_tap_interval_ms,
    ) {
        return unsafe { CallNextHookEx(None, code, wparam, lparam) };
    }

    let _ = try_start_trigger_session(app_handle, target_app);

    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

fn process_trigger(app_handle: AppHandle, session_id: String, target_app: SystemInputTargetApp) {
    let managed_state = app_handle.state::<SystemInputState>();
    let snapshot = match managed_state.snapshot() {
        Ok(snapshot) => snapshot,
        Err(error) => {
            let _ = managed_state.set_last_error(Some(error));
            let _ = emit_status(&app_handle);
            return;
        }
    };

    match capture_text_for_request(&snapshot.config) {
        Ok(Some(capture_outcome)) => {
            if snapshot.config.only_when_english_text
                && !is_likely_english_text(&capture_outcome.preferred_text)
            {
                let message = "当前仅在英文文本时触发系统输入增强。".to_string();
                let _ = managed_state.cancel_session(
                    &crate::system_input::types::SystemInputCancelSessionPayload {
                        session_id,
                        error: Some(message.clone()),
                    },
                );
                let _ = managed_state.set_last_error(Some(message));
                let _ = emit_status(&app_handle);
                return;
            }

            let payload = SystemInputTranslationRequestPayload {
                session_id,
                trigger_mode: snapshot.config.trigger_mode,
                source_language: snapshot.config.source_language,
                target_language: snapshot.config.target_language,
                target_app: Some(target_app.clone()),
                captured_text: SystemInputCapturedText {
                    selected_text: capture_outcome.selected_text,
                    before_caret_text: capture_outcome.before_caret_text,
                    whole_input_text: capture_outcome.whole_input_text,
                    preferred_text: capture_outcome.preferred_text,
                    preferred_strategy: capture_outcome.preferred_strategy,
                },
                emitted_at: current_timestamp_string(),
            };

            let emitted_session_id = payload.session_id.clone();

            if let Err(error) = app_handle.emit(SYSTEM_INPUT_TRANSLATION_REQUEST_EVENT, payload) {
                let message = format!("failed to emit translation request: {error}");
                let _ = managed_state.cancel_session(
                    &crate::system_input::types::SystemInputCancelSessionPayload {
                        session_id: emitted_session_id,
                        error: Some(message.clone()),
                    },
                );
                let _ = managed_state.set_last_error(Some(message));
                let _ = emit_status(&app_handle);
            }
        }
        Ok(None) => {
            let message =
                "未捕获到可翻译文本。你可以先选中文本，或在普通输入框中把光标停在行尾再触发。"
                    .to_string();
            let _ = managed_state.cancel_session(
                &crate::system_input::types::SystemInputCancelSessionPayload {
                    session_id,
                    error: Some(message.clone()),
                },
            );
            let _ = managed_state.set_last_error(Some(message));
            let _ = emit_status(&app_handle);
        }
        Err(error) => {
            let _ = managed_state.cancel_session(
                &crate::system_input::types::SystemInputCancelSessionPayload {
                    session_id,
                    error: Some(error.clone()),
                },
            );
            let _ = managed_state.set_last_error(Some(error));
            let _ = emit_status(&app_handle);
        }
    }
}

fn emit_status(app_handle: &AppHandle) -> Result<(), String> {
    let managed_state = app_handle.state::<SystemInputState>();
    let snapshot = managed_state.snapshot()?;
    let mut status = build_status(&snapshot.config);
    status.last_error = snapshot.status.last_error;
    status.last_target_app = snapshot.status.last_target_app;
    app_handle
        .emit(SYSTEM_INPUT_STATUS_EVENT, status)
        .map_err(|error| format!("failed to emit status event: {error}"))
}

fn capture_text_for_request(config: &SystemInputConfig) -> Result<Option<CaptureOutcome>, String> {
    if let Some(capture_outcome) = capture_text_via_uiautomation(config)? {
        return Ok(Some(capture_outcome));
    }

    if let Some(text) =
        capture_text_by_keyboard_strategy(CaptureStrategy::ExistingSelection, config)?
    {
        return Ok(Some(CaptureOutcome {
            selected_text: Some(text.clone()),
            before_caret_text: None,
            whole_input_text: None,
            preferred_text: text,
            preferred_strategy: "selection-first".to_string(),
        }));
    }

    if config.only_selected_text {
        return Ok(None);
    }

    let ordered_strategies: [CaptureStrategy; 2] = match config.capture_mode {
        SystemInputCaptureMode::SelectionFirst | SystemInputCaptureMode::BeforeCaretFirst => [
            CaptureStrategy::BeforeCaretSelection,
            CaptureStrategy::WholeInputSelection,
        ],
        SystemInputCaptureMode::WholeInputFirst => [
            CaptureStrategy::WholeInputSelection,
            CaptureStrategy::BeforeCaretSelection,
        ],
    };

    for strategy in ordered_strategies {
        if let Some(text) = capture_text_by_keyboard_strategy(strategy, config)? {
            return Ok(Some(match strategy {
                CaptureStrategy::BeforeCaretSelection => CaptureOutcome {
                    selected_text: None,
                    before_caret_text: Some(text.clone()),
                    whole_input_text: None,
                    preferred_text: text,
                    preferred_strategy: "before-caret-first".to_string(),
                },
                CaptureStrategy::WholeInputSelection => CaptureOutcome {
                    selected_text: None,
                    before_caret_text: None,
                    whole_input_text: Some(text.clone()),
                    preferred_text: text,
                    preferred_strategy: "whole-input-first".to_string(),
                },
                CaptureStrategy::ExistingSelection => CaptureOutcome {
                    selected_text: Some(text.clone()),
                    before_caret_text: None,
                    whole_input_text: None,
                    preferred_text: text,
                    preferred_strategy: "selection-first".to_string(),
                },
            }));
        }
    }

    Ok(None)
}

fn capture_text_via_uiautomation(
    config: &SystemInputConfig,
) -> Result<Option<CaptureOutcome>, String> {
    let automation = match UIAutomation::new() {
        Ok(automation) => automation,
        Err(_) => return Ok(None),
    };

    let focused_element = match automation.get_focused_element() {
        Ok(element) => element,
        Err(_) => return Ok(None),
    };

    let Some(text_element) = find_editable_text_element(&automation, &focused_element) else {
        return Ok(None);
    };

    if text_element.is_password().unwrap_or(false) {
        return Ok(None);
    }

    if let Some(text) = capture_text_by_uiautomation_strategy(
        &text_element,
        CaptureStrategy::ExistingSelection,
        config,
    )? {
        return Ok(Some(CaptureOutcome {
            selected_text: Some(text.clone()),
            before_caret_text: None,
            whole_input_text: None,
            preferred_text: text,
            preferred_strategy: "selection-first".to_string(),
        }));
    }

    if config.only_selected_text {
        return Ok(None);
    }

    let ordered_strategies: [CaptureStrategy; 2] = match config.capture_mode {
        SystemInputCaptureMode::SelectionFirst | SystemInputCaptureMode::BeforeCaretFirst => [
            CaptureStrategy::BeforeCaretSelection,
            CaptureStrategy::WholeInputSelection,
        ],
        SystemInputCaptureMode::WholeInputFirst => [
            CaptureStrategy::WholeInputSelection,
            CaptureStrategy::BeforeCaretSelection,
        ],
    };

    for strategy in ordered_strategies {
        if let Some(text) = capture_text_by_uiautomation_strategy(&text_element, strategy, config)?
        {
            return Ok(Some(match strategy {
                CaptureStrategy::BeforeCaretSelection => CaptureOutcome {
                    selected_text: None,
                    before_caret_text: Some(text.clone()),
                    whole_input_text: None,
                    preferred_text: text,
                    preferred_strategy: "before-caret-first".to_string(),
                },
                CaptureStrategy::WholeInputSelection => CaptureOutcome {
                    selected_text: None,
                    before_caret_text: None,
                    whole_input_text: Some(text.clone()),
                    preferred_text: text,
                    preferred_strategy: "whole-input-first".to_string(),
                },
                CaptureStrategy::ExistingSelection => CaptureOutcome {
                    selected_text: Some(text.clone()),
                    before_caret_text: None,
                    whole_input_text: None,
                    preferred_text: text,
                    preferred_strategy: "selection-first".to_string(),
                },
            }));
        }
    }

    Ok(None)
}

fn find_editable_text_element(
    automation: &UIAutomation,
    focused_element: &UIElement,
) -> Option<UIElement> {
    let walker = automation.get_raw_view_walker().ok()?;
    let mut current = focused_element.clone();

    for _ in 0..8 {
        if is_text_capture_candidate(&current) && current.get_pattern::<UITextPattern>().is_ok() {
            return Some(current);
        }

        current = match walker.get_parent(&current) {
            Ok(parent) => parent,
            Err(_) => break,
        };
    }

    None
}

fn find_editable_writeback_element(
    automation: &UIAutomation,
    focused_element: &UIElement,
) -> Option<UIElement> {
    let walker = automation.get_raw_view_walker().ok()?;
    let mut current = focused_element.clone();

    for _ in 0..8 {
        if is_text_capture_candidate(&current)
            && (current.get_pattern::<UITextPattern>().is_ok()
                || current.get_pattern::<UIValuePattern>().is_ok())
        {
            return Some(current);
        }

        current = match walker.get_parent(&current) {
            Ok(parent) => parent,
            Err(_) => break,
        };
    }

    None
}

fn is_text_capture_candidate(element: &UIElement) -> bool {
    matches!(
        element.get_control_type().ok(),
        Some(ControlType::Edit | ControlType::Document | ControlType::Pane | ControlType::Custom)
    )
}

fn capture_text_by_uiautomation_strategy(
    element: &UIElement,
    strategy: CaptureStrategy,
    config: &SystemInputConfig,
) -> Result<Option<String>, String> {
    let text_pattern = match element.get_pattern::<UITextPattern>() {
        Ok(pattern) => pattern,
        Err(_) => return Ok(None),
    };

    match strategy {
        CaptureStrategy::ExistingSelection => {
            let selected_ranges = match text_pattern.get_selection() {
                Ok(ranges) => ranges,
                Err(_) => return Ok(None),
            };

            let text = join_range_texts(&selected_ranges, &config.trigger_mode)?;
            Ok((!text.is_empty()).then_some(text))
        }
        CaptureStrategy::BeforeCaretSelection => {
            let document_range = match text_pattern.get_document_range() {
                Ok(range) => range,
                Err(_) => return Ok(None),
            };
            let (_, caret_range) = match text_pattern.get_caret_range() {
                Ok(result) => result,
                Err(_) => return Ok(None),
            };

            if document_range
                .move_endpoint_by_range(
                    TextPatternRangeEndpoint::End,
                    &caret_range,
                    TextPatternRangeEndpoint::Start,
                )
                .is_err()
            {
                return Ok(None);
            }

            let normalized = normalize_captured_text(
                &document_range.get_text(-1).map_err(|error| {
                    format!("failed to read UI Automation document text: {error}")
                })?,
                &config.trigger_mode,
            );

            if normalized.is_empty() {
                return Ok(None);
            }

            document_range
                .select()
                .map_err(|error| format!("failed to select UI Automation text range: {error}"))?;

            Ok(Some(normalized))
        }
        CaptureStrategy::WholeInputSelection => {
            let document_range = match text_pattern.get_document_range() {
                Ok(range) => range,
                Err(_) => return Ok(None),
            };

            let normalized = normalize_captured_text(
                &document_range.get_text(-1).map_err(|error| {
                    format!("failed to read UI Automation whole input text: {error}")
                })?,
                &config.trigger_mode,
            );

            if normalized.is_empty() {
                return Ok(None);
            }

            document_range.select().map_err(|error| {
                format!("failed to select UI Automation whole input range: {error}")
            })?;

            Ok(Some(normalized))
        }
    }
}

fn join_range_texts(
    ranges: &[UITextRange],
    trigger_mode: &SystemInputTriggerMode,
) -> Result<String, String> {
    let mut segments = Vec::new();

    for range in ranges {
        let normalized = normalize_captured_text(
            &range
                .get_text(-1)
                .map_err(|error| format!("failed to read UI Automation selection text: {error}"))?,
            trigger_mode,
        );

        if !normalized.is_empty() {
            segments.push(normalized);
        }
    }

    Ok(segments.join("\n"))
}

fn join_raw_range_texts(ranges: &[UITextRange]) -> Result<String, String> {
    let mut segments = Vec::new();

    for range in ranges {
        let text = range
            .get_text(-1)
            .map_err(|error| format!("failed to read UI Automation raw selection text: {error}"))?;

        if !text.is_empty() {
            segments.push(text);
        }
    }

    Ok(segments.join("\n"))
}

fn capture_text_by_keyboard_strategy(
    strategy: CaptureStrategy,
    config: &SystemInputConfig,
) -> Result<Option<String>, String> {
    let mut clipboard =
        Clipboard::new().map_err(|error| format!("failed to access clipboard: {error}"))?;
    let original_text = clipboard.get_text().ok();
    let sequence_before = unsafe { GetClipboardSequenceNumber() };

    match strategy {
        CaptureStrategy::ExistingSelection => {
            send_key_combo(VK_CONTROL, VK_C_KEY)?;
        }
        CaptureStrategy::BeforeCaretSelection => {
            send_key_combo(VK_SHIFT, VK_HOME)?;
            thread::sleep(Duration::from_millis(25));
            send_key_combo(VK_CONTROL, VK_C_KEY)?;
        }
        CaptureStrategy::WholeInputSelection => {
            send_key_combo(VK_CONTROL, VK_A_KEY)?;
            thread::sleep(Duration::from_millis(25));
            send_key_combo(VK_CONTROL, VK_C_KEY)?;
        }
    }

    let deadline = Instant::now() + Duration::from_millis(360);
    let mut captured_text: Option<String> = None;

    while Instant::now() <= deadline {
        thread::sleep(Duration::from_millis(25));

        let sequence_after = unsafe { GetClipboardSequenceNumber() };
        if sequence_after == sequence_before {
            continue;
        }

        let mut read_clipboard =
            Clipboard::new().map_err(|error| format!("failed to reopen clipboard: {error}"))?;
        captured_text = read_clipboard
            .get_text()
            .ok()
            .map(|text| normalize_captured_text(&text, &config.trigger_mode))
            .filter(|text| !text.is_empty());
        break;
    }

    if let Some(text) = original_text {
        let mut restore_clipboard =
            Clipboard::new().map_err(|error| format!("failed to reopen clipboard: {error}"))?;
        let _ = restore_clipboard.set_text(text);
    }

    Ok(captured_text)
}

fn normalize_captured_text(text: &str, trigger_mode: &SystemInputTriggerMode) -> String {
    let mut normalized = text
        .trim_matches(|character| character == '\r' || character == '\n')
        .to_string();

    if matches!(trigger_mode, SystemInputTriggerMode::DoubleSpace) && normalized.ends_with("  ") {
        normalized.truncate(normalized.len().saturating_sub(2));
    }

    normalized.trim().to_string()
}

fn current_target_app() -> Option<SystemInputTargetApp> {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.0.is_null() {
        return None;
    }

    let mut process_id = 0u32;
    unsafe {
        let _ = GetWindowThreadProcessId(hwnd, Some(&mut process_id));
    }

    Some(SystemInputTargetApp {
        process_id: if process_id == 0 {
            None
        } else {
            Some(process_id)
        },
        process_name: process_name(process_id),
        bundle_id: None,
        app_name: None,
        window_title: window_title(hwnd),
        window_handle: Some(format!("0x{:X}", hwnd.0 as usize)),
    })
}

fn process_name(process_id: u32) -> Option<String> {
    if process_id == 0 {
        return None;
    }

    let cache = PROCESS_NAME_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(cache_guard) = cache.lock() {
        if let Some(cached) = cache_guard.get(&process_id) {
            return cached.clone();
        }
    }

    let process_handle =
        unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) }.ok()?;
    let mut buffer = vec![0u16; 32768];
    let mut size = buffer.len() as u32;

    let result = unsafe {
        QueryFullProcessImageNameW(
            process_handle,
            PROCESS_NAME_FORMAT(0),
            PWSTR(buffer.as_mut_ptr()),
            &mut size,
        )
    };

    let _ = unsafe { CloseHandle(process_handle) };

    let resolved_name = result.ok().and_then(|_| {
        std::path::Path::new(&String::from_utf16_lossy(&buffer[..size as usize]))
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
    });

    if let Ok(mut cache_guard) = cache.lock() {
        cache_guard.insert(process_id, resolved_name.clone());
    }

    resolved_name
}

fn window_title(hwnd: HWND) -> Option<String> {
    let mut buffer = [0u16; 512];
    let length = unsafe { GetWindowTextW(hwnd, &mut buffer) } as usize;

    if length == 0 {
        return None;
    }

    Some(String::from_utf16_lossy(&buffer[..length]))
}

fn resolve_writeback_element(
    target_app: Option<&SystemInputTargetApp>,
) -> Result<Option<UIElement>, String> {
    let Some(expected_target) = target_app else {
        return Ok(None);
    };

    let Some(current_target) = current_target_app() else {
        return Ok(None);
    };

    if !target_app_matches(expected_target, &current_target) {
        return Ok(None);
    }

    let automation = UIAutomation::new()
        .map_err(|error| format!("failed to create UI Automation client: {error}"))?;
    let focused_element = automation
        .get_focused_element()
        .map_err(|error| format!("failed to resolve focused element for writeback: {error}"))?;

    Ok(find_editable_writeback_element(
        &automation,
        &focused_element,
    ))
}

fn read_writeback_text_context(element: &UIElement) -> WritebackTextContext {
    let mut context = WritebackTextContext::default();

    if let Ok(text_pattern) = element.get_pattern::<UITextPattern>() {
        if let Ok(selection_ranges) = text_pattern.get_selection() {
            context.raw_selection_text = join_raw_range_texts(&selection_ranges)
                .ok()
                .filter(|text| !text.is_empty());
        }

        if let Ok(document_range) = text_pattern.get_document_range() {
            context.raw_document_text = document_range
                .get_text(-1)
                .ok()
                .filter(|text| !text.is_empty());
        }
    }

    if context.raw_document_text.is_none() {
        if let Ok(value_pattern) = element.get_pattern::<UIValuePattern>() {
            context.raw_document_text = value_pattern
                .get_value()
                .ok()
                .filter(|text| !text.is_empty());
        }
    }

    context
}

fn build_native_replacement_text(
    translated_text: &str,
    source_text: &str,
    capture_strategy: &str,
    context: &WritebackTextContext,
) -> Option<String> {
    match capture_strategy {
        "whole-input-first" => {
            let document = context.raw_document_text.as_deref()?;
            if text_matches_source(document, source_text) {
                Some(translated_text.to_string())
            } else {
                None
            }
        }
        "before-caret-first" => {
            let selected = context.raw_selection_text.as_deref()?;
            let document = context.raw_document_text.as_deref()?;

            if !text_matches_source(selected, source_text) {
                return None;
            }

            document
                .strip_prefix(selected)
                .map(|suffix| format!("{translated_text}{suffix}"))
        }
        "selection-first" => {
            let selected = context.raw_selection_text.as_deref()?;
            let document = context.raw_document_text.as_deref()?;

            if !text_matches_source(selected, source_text) {
                return None;
            }

            if document == selected {
                return Some(translated_text.to_string());
            }

            let occurrence_count = document.matches(selected).count();
            if occurrence_count == 1 {
                Some(document.replacen(selected, translated_text, 1))
            } else {
                None
            }
        }
        _ => None,
    }
}

fn selection_matches_source(context: &WritebackTextContext, source_text: &str) -> bool {
    context
        .raw_selection_text
        .as_deref()
        .map(|selection| text_matches_source(selection, source_text))
        .unwrap_or(false)
}

fn text_matches_source(raw_text: &str, source_text: &str) -> bool {
    normalized_writeback_source(Some(raw_text)).as_deref() == Some(source_text)
}

fn normalized_writeback_source(text: Option<&str>) -> Option<String> {
    text.map(|value| {
        value
            .trim_matches(|character| character == '\r' || character == '\n' || character == ' ')
            .to_string()
    })
    .filter(|value| !value.is_empty())
}

fn send_key_combo(modifier: VIRTUAL_KEY, key: VIRTUAL_KEY) -> Result<(), String> {
    let inputs = vec![
        keyboard_input(modifier, false),
        keyboard_input(key, false),
        keyboard_input(key, true),
        keyboard_input(modifier, true),
    ];

    send_inputs(&inputs)
}

#[allow(dead_code)]
fn send_key(key: VIRTUAL_KEY) -> Result<(), String> {
    let inputs = vec![keyboard_input(key, false), keyboard_input(key, true)];
    send_inputs(&inputs)
}

fn send_unicode_text(text: &str) -> Result<(), String> {
    let mut inputs = Vec::new();

    for code_unit in text.encode_utf16() {
        inputs.push(unicode_keyboard_input(code_unit, false));
        inputs.push(unicode_keyboard_input(code_unit, true));
    }

    send_inputs(&inputs)
}

fn send_inputs(inputs: &[INPUT]) -> Result<(), String> {
    let sent = unsafe { SendInput(inputs, size_of::<INPUT>() as i32) };

    if sent != inputs.len() as u32 {
        return Err("failed to send simulated keyboard input".to_string());
    }

    Ok(())
}

fn keyboard_input(key: VIRTUAL_KEY, key_up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key,
                wScan: 0,
                dwFlags: if key_up {
                    KEYEVENTF_KEYUP
                } else {
                    KEYBD_EVENT_FLAGS(0)
                },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn unicode_keyboard_input(scan_code: u16, key_up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(0),
                wScan: scan_code,
                dwFlags: if key_up {
                    KEYEVENTF_UNICODE | KEYEVENTF_KEYUP
                } else {
                    KEYEVENTF_UNICODE
                },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn should_trigger(trigger_mode: SystemInputTriggerMode, vk_code: u32, interval_ms: u64) -> bool {
    let Ok(mut state) = detector_state().lock() else {
        return false;
    };

    let now = Instant::now();
    let threshold = Duration::from_millis(interval_ms.max(120));

    match trigger_mode {
        SystemInputTriggerMode::DoubleAlt => {
            if vk_code != VK_LMENU.0 as u32 && vk_code != VK_RMENU.0 as u32 {
                return false;
            }

            let triggered = state
                .last_alt_up
                .map(|last| now.duration_since(last) <= threshold)
                .unwrap_or(false);
            state.last_alt_up = if triggered { None } else { Some(now) };
            triggered
        }
        SystemInputTriggerMode::DoubleSpace => {
            if vk_code != VK_SPACE.0 as u32 || modifier_pressed() {
                return false;
            }

            let triggered = state
                .last_space_up
                .map(|last| now.duration_since(last) <= threshold)
                .unwrap_or(false);
            state.last_space_up = if triggered { None } else { Some(now) };
            triggered
        }
        SystemInputTriggerMode::ManualHotkey => false,
    }
}

fn modifier_pressed() -> bool {
    unsafe {
        GetAsyncKeyState(i32::from(VK_CONTROL.0)) < 0
            || GetAsyncKeyState(i32::from(VK_LMENU.0)) < 0
            || GetAsyncKeyState(i32::from(VK_RMENU.0)) < 0
    }
}

fn matches_app_filters(config: &SystemInputConfig, target_app: &SystemInputTargetApp) -> bool {
    let haystacks = [
        target_app.window_title.as_deref(),
        target_app.process_name.as_deref(),
        target_app.app_name.as_deref(),
    ];

    if !config.app_whitelist.is_empty() {
        let matched = config.app_whitelist.iter().any(|keyword| {
            haystacks.iter().flatten().any(|value| {
                value
                    .to_ascii_lowercase()
                    .contains(&keyword.to_ascii_lowercase())
            })
        });

        if !matched {
            return false;
        }
    }

    !config.app_blacklist.iter().any(|keyword| {
        haystacks.iter().flatten().any(|value| {
            value
                .to_ascii_lowercase()
                .contains(&keyword.to_ascii_lowercase())
        })
    })
}

fn is_excluded_code_editor(config: &SystemInputConfig, target_app: &SystemInputTargetApp) -> bool {
    if !config.exclude_code_editors {
        return false;
    }

    let haystacks = [
        target_app
            .window_title
            .as_deref()
            .map(|value| value.to_ascii_lowercase())
            .unwrap_or_default(),
        target_app
            .process_name
            .as_deref()
            .map(|value| value.to_ascii_lowercase())
            .unwrap_or_default(),
    ];

    haystacks.iter().any(|value| {
        [
            "visual studio code",
            "cursor",
            "jetbrains",
            "visual studio",
            "windsurf",
            "code.exe",
        ]
        .iter()
        .any(|keyword| value.contains(keyword))
    })
}

fn is_likely_english_text(text: &str) -> bool {
    let meaningful_chars: Vec<char> = text
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect();

    if meaningful_chars.is_empty() {
        return false;
    }

    let ascii_like_count = meaningful_chars
        .iter()
        .filter(|character| character.is_ascii() && !character.is_ascii_digit())
        .count();

    ascii_like_count * 2 >= meaningful_chars.len()
}

fn current_timestamp_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn build_session_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);

    format!("system-input-{millis}")
}

fn target_app_matches(expected: &SystemInputTargetApp, current: &SystemInputTargetApp) -> bool {
    if let (Some(expected_handle), Some(current_handle)) =
        (&expected.window_handle, &current.window_handle)
    {
        if expected_handle != current_handle {
            return false;
        }
    }

    if expected.process_id.is_some()
        && current.process_id.is_some()
        && expected.process_id != current.process_id
    {
        return false;
    }

    match (&expected.window_title, &current.window_title) {
        (Some(expected_title), Some(current_title)) => expected_title == current_title,
        _ => true,
    }
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;

    fn create_target_app() -> SystemInputTargetApp {
        SystemInputTargetApp {
            process_id: Some(1234),
            process_name: Some("notepad.exe".to_string()),
            bundle_id: None,
            app_name: Some("Notepad".to_string()),
            window_title: Some("记事本".to_string()),
            window_handle: Some("0x1234".to_string()),
        }
    }

    #[test]
    fn normalize_captured_text_removes_double_space_trigger_suffix() {
        let text = normalize_captured_text("hello world  ", &SystemInputTriggerMode::DoubleSpace);
        assert_eq!(text, "hello world");
    }

    #[test]
    fn normalize_captured_text_trims_newlines_and_spaces() {
        let text =
            normalize_captured_text("\r\n hello world \r\n", &SystemInputTriggerMode::DoubleAlt);
        assert_eq!(text, "hello world");
    }

    #[test]
    fn build_native_replacement_text_replaces_before_caret_prefix() {
        let context = WritebackTextContext {
            raw_selection_text: Some("hello world".to_string()),
            raw_document_text: Some("hello world tail".to_string()),
        };

        let replacement = build_native_replacement_text(
            "你好世界",
            "hello world",
            "before-caret-first",
            &context,
        );

        assert_eq!(replacement.as_deref(), Some("你好世界 tail"));
    }

    #[test]
    fn build_native_replacement_text_replaces_whole_input() {
        let context = WritebackTextContext {
            raw_selection_text: None,
            raw_document_text: Some("hello world".to_string()),
        };

        let replacement =
            build_native_replacement_text("你好世界", "hello world", "whole-input-first", &context);

        assert_eq!(replacement.as_deref(), Some("你好世界"));
    }

    #[test]
    fn build_native_replacement_text_requires_unique_selection_occurrence() {
        let context = WritebackTextContext {
            raw_selection_text: Some("hello".to_string()),
            raw_document_text: Some("hello and hello".to_string()),
        };

        let replacement =
            build_native_replacement_text("你好", "hello", "selection-first", &context);

        assert_eq!(replacement, None);
    }

    #[test]
    fn matches_app_filters_honors_whitelist_and_blacklist() {
        let mut config = SystemInputConfig::default();
        config.app_whitelist = vec!["notepad".to_string()];
        config.app_blacklist = vec!["wechat".to_string()];

        let target_app = create_target_app();

        assert!(matches_app_filters(&config, &target_app));

        config.app_blacklist = vec!["note".to_string()];
        assert!(!matches_app_filters(&config, &target_app));
    }

    #[test]
    fn excludes_code_editor_when_enabled() {
        let mut config = SystemInputConfig::default();
        config.exclude_code_editors = true;

        let target_app = SystemInputTargetApp {
            process_id: Some(5678),
            process_name: Some("Code.exe".to_string()),
            bundle_id: None,
            app_name: Some("Visual Studio Code".to_string()),
            window_title: Some("main.ts - Visual Studio Code".to_string()),
            window_handle: Some("0x5678".to_string()),
        };

        assert!(is_excluded_code_editor(&config, &target_app));

        config.exclude_code_editors = false;
        assert!(!is_excluded_code_editor(&config, &target_app));
    }

    #[test]
    fn english_text_detection_prefers_ascii_content() {
        assert!(is_likely_english_text("hello world"));
        assert!(is_likely_english_text("translate this please"));
        assert!(!is_likely_english_text("这是一次中文测试"));
    }

    #[test]
    fn target_app_matching_requires_same_handle_and_title_when_available() {
        let expected = create_target_app();

        let same_target = create_target_app();
        assert!(target_app_matches(&expected, &same_target));

        let different_handle = SystemInputTargetApp {
            window_handle: Some("0x9999".to_string()),
            ..create_target_app()
        };
        assert!(!target_app_matches(&expected, &different_handle));

        let different_title = SystemInputTargetApp {
            window_title: Some("Other".to_string()),
            ..create_target_app()
        };
        assert!(!target_app_matches(&expected, &different_title));
    }

    #[test]
    fn double_alt_trigger_requires_two_presses_within_threshold() {
        if let Ok(mut detector) = detector_state().lock() {
            *detector = DetectorState::default();
        }

        assert!(!should_trigger(
            SystemInputTriggerMode::DoubleAlt,
            VK_LMENU.0 as u32,
            280,
        ));
        assert!(should_trigger(
            SystemInputTriggerMode::DoubleAlt,
            VK_LMENU.0 as u32,
            280,
        ));
    }
}
