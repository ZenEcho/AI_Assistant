use super::types::{
    SystemInputConfig, SystemInputPermissionState, SystemInputStatusPayload, SystemInputTargetApp,
};
use tauri::AppHandle;

#[cfg(target_os = "linux")]
use std::env;

#[cfg(target_os = "linux")]
pub mod linux_wayland;
#[cfg(target_os = "linux")]
pub mod linux_x11;
#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "windows")]
pub mod windows;

pub fn ensure_runtime_started(app: &AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        return windows::ensure_runtime_started(app);
    }

    #[allow(unreachable_code)]
    Ok(())
}

pub fn build_status(config: &SystemInputConfig) -> SystemInputStatusPayload {
    #[cfg(target_os = "windows")]
    {
        return windows::build_status(config);
    }

    #[cfg(target_os = "macos")]
    {
        return macos::build_status(config);
    }

    #[cfg(target_os = "linux")]
    {
        return if env::var("XDG_SESSION_TYPE")
            .map(|value| value.eq_ignore_ascii_case("wayland"))
            .unwrap_or(false)
        {
            linux_wayland::build_status(config)
        } else {
            linux_x11::build_status(config)
        };
    }

    #[allow(unreachable_code)]
    SystemInputStatusPayload {
        native_ready: false,
        active: false,
        platform: std::env::consts::OS.to_string(),
        permission_state: SystemInputPermissionState::Unknown,
        last_error: Some("当前平台尚未接入快捷输入原生实现。".to_string()),
    }
}

pub fn capture_selected_text() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        return windows::capture_selected_text();
    }

    #[allow(unreachable_code)]
    Ok(None)
}

pub fn read_clipboard_text() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        return windows::read_clipboard_text();
    }

    #[allow(unreachable_code)]
    Ok(None)
}

pub fn paste_text(text: &str, target_app: Option<&SystemInputTargetApp>) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        return windows::paste_text(text, target_app);
    }

    #[cfg(not(target_os = "windows"))]
    let _ = text;
    #[cfg(not(target_os = "windows"))]
    let _ = target_app;

    #[allow(unreachable_code)]
    Ok(false)
}
