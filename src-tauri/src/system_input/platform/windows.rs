use std::{
    collections::HashMap,
    mem::size_of,
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, Instant},
};

use arboard::Clipboard;
use tauri::AppHandle;
use windows::core::PWSTR;
use windows::Win32::{
    Foundation::{CloseHandle, HWND},
    System::{
        DataExchange::GetClipboardSequenceNumber,
        Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
            PROCESS_QUERY_LIMITED_INFORMATION,
        },
    },
    UI::{
        Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS,
            KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_CONTROL,
        },
        WindowsAndMessaging::{
            GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
        },
    },
};

use crate::system_input::types::{
    SystemInputConfig, SystemInputPermissionState, SystemInputStatusPayload, SystemInputTargetApp,
};

static PROCESS_NAME_CACHE: OnceLock<Mutex<HashMap<u32, Option<String>>>> = OnceLock::new();

const VK_C_KEY: VIRTUAL_KEY = VIRTUAL_KEY(0x43);
const VK_V_KEY: VIRTUAL_KEY = VIRTUAL_KEY(0x56);

#[derive(Debug, Clone, Copy)]
enum CaptureStrategy {
    ExistingSelection,
}

pub fn ensure_runtime_started(app: &AppHandle) -> Result<(), String> {
    let _ = app;
    Ok(())
}

pub fn build_status(config: &SystemInputConfig) -> SystemInputStatusPayload {
    SystemInputStatusPayload {
        native_ready: true,
        active: config.enabled,
        platform: "windows".to_string(),
        permission_state: SystemInputPermissionState::NotRequired,
        last_error: None,
    }
}

pub fn capture_selected_text() -> Result<Option<String>, String> {
    let Some(target_app) = current_target_app() else {
        return Ok(None);
    };

    if target_app.process_id == Some(std::process::id()) {
        return Ok(None);
    }

    capture_text_by_keyboard_strategy(CaptureStrategy::ExistingSelection)
}

pub fn read_clipboard_text() -> Result<Option<String>, String> {
    let mut clipboard =
        Clipboard::new().map_err(|error| format!("failed to access clipboard: {error}"))?;

    Ok(clipboard
        .get_text()
        .ok()
        .map(|text| normalize_captured_text(&text))
        .filter(|text| !text.is_empty()))
}

pub fn paste_text(text: &str, target_app: Option<&SystemInputTargetApp>) -> Result<bool, String> {
    if text.trim().is_empty() {
        return Ok(false);
    }

    paste_clipboard_text(text, target_app)
}

fn capture_text_by_keyboard_strategy(
    strategy: CaptureStrategy,
) -> Result<Option<String>, String> {
    let mut clipboard =
        Clipboard::new().map_err(|error| format!("failed to access clipboard: {error}"))?;
    let original_text = clipboard.get_text().ok();
    let sequence_before = unsafe { GetClipboardSequenceNumber() };

    match strategy {
        CaptureStrategy::ExistingSelection => {
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
            .map(|text| normalize_captured_text(&text))
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

fn normalize_captured_text(text: &str) -> String {
    text.trim().to_string()
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

fn send_key_combo(modifier: VIRTUAL_KEY, key: VIRTUAL_KEY) -> Result<(), String> {
    let inputs = vec![
        keyboard_input(modifier, false),
        keyboard_input(key, false),
        keyboard_input(key, true),
        keyboard_input(modifier, true),
    ];

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
    fn normalize_captured_text_trims_newlines_and_spaces() {
        let text = normalize_captured_text("\r\n hello world \r\n");
        assert_eq!(text, "hello world");
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
}
