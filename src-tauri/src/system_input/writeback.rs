use super::types::{
    SystemInputConfig, SystemInputTargetApp, SystemInputTranslationSubmitPayload,
    SystemInputWritebackMode, SystemInputWritebackResultPayload,
};

pub fn write_translation(
    config: &SystemInputConfig,
    payload: &SystemInputTranslationSubmitPayload,
    target_app: Option<&SystemInputTargetApp>,
) -> SystemInputWritebackResultPayload {
    write_translation_with_executor(config, payload, target_app, |strategy| match strategy {
        "native-replace" => super::platform::try_native_writeback(
            &payload.translated_text,
            payload.source_text.as_deref(),
            payload.capture_strategy.as_deref(),
            payload.target_app.as_ref().or(target_app),
        ),
        "simulate-input" => super::platform::try_simulated_writeback(
            &payload.translated_text,
            payload.source_text.as_deref(),
            payload.capture_strategy.as_deref(),
            payload.target_app.as_ref().or(target_app),
        ),
        "clipboard-paste" => super::platform::try_clipboard_writeback(
            &payload.translated_text,
            payload.target_app.as_ref().or(target_app),
        ),
        _ => Ok(false),
    })
}

fn write_translation_with_executor<F>(
    config: &SystemInputConfig,
    payload: &SystemInputTranslationSubmitPayload,
    target_app: Option<&SystemInputTargetApp>,
    mut execute_strategy: F,
) -> SystemInputWritebackResultPayload
where
    F: FnMut(&str) -> Result<bool, String>,
{
    if !config.auto_replace || matches!(config.writeback_mode, SystemInputWritebackMode::PopupOnly)
    {
        return SystemInputWritebackResultPayload {
            session_id: payload.session_id.clone(),
            success: false,
            used_strategy: "popup-only".to_string(),
            fallback_window_required: payload.open_result_window_on_failure,
            error: Some("当前会话未启用自动替换，已回退到结果窗口。".to_string()),
        };
    }

    let effective_target_app = payload.target_app.as_ref().or(target_app);
    let mut attempt_errors = Vec::new();

    let mut strategies: Vec<&str> = match config.writeback_mode {
        SystemInputWritebackMode::Auto => vec!["native-replace", "simulate-input"],
        SystemInputWritebackMode::NativeReplace => vec!["native-replace"],
        SystemInputWritebackMode::SimulateInput => vec!["simulate-input"],
        SystemInputWritebackMode::ClipboardPaste => Vec::new(),
        SystemInputWritebackMode::PopupOnly => Vec::new(),
    };

    let allow_clipboard = matches!(
        config.writeback_mode,
        SystemInputWritebackMode::Auto | SystemInputWritebackMode::ClipboardPaste
    ) || config.enable_clipboard_fallback;

    if allow_clipboard {
        strategies.push("clipboard-paste");
    }

    for strategy in strategies {
        let _ = effective_target_app;
        let attempt_result = execute_strategy(strategy);

        match attempt_result {
            Ok(true) => {
                return SystemInputWritebackResultPayload {
                    session_id: payload.session_id.clone(),
                    success: true,
                    used_strategy: strategy.to_string(),
                    fallback_window_required: false,
                    error: None,
                };
            }
            Ok(false) => {}
            Err(error) => {
                attempt_errors.push(format!("{strategy}: {error}"));
            }
        }
    }

    SystemInputWritebackResultPayload {
        session_id: payload.session_id.clone(),
        success: false,
        used_strategy: "popup-only".to_string(),
        fallback_window_required: payload.open_result_window_on_failure,
        error: Some(if attempt_errors.is_empty() {
            "当前回填策略未能在目标输入框中完成替换，已回退到结果窗口。".to_string()
        } else {
            format!(
                "自动回填失败，已回退到结果窗口：{}",
                attempt_errors.join(" | ")
            )
        }),
    }
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use std::collections::VecDeque;

    use super::*;
    use crate::system_input::types::{SystemInputTargetApp, SystemInputTranslationSubmitPayload};

    fn create_payload() -> SystemInputTranslationSubmitPayload {
        SystemInputTranslationSubmitPayload {
            session_id: "session-1".to_string(),
            translated_text: "translated".to_string(),
            display_text: Some("translated".to_string()),
            source_text: Some("hello world".to_string()),
            capture_strategy: Some("before-caret-first".to_string()),
            target_app: Some(SystemInputTargetApp {
                process_id: Some(1234),
                process_name: Some("notepad.exe".to_string()),
                bundle_id: None,
                app_name: None,
                window_title: Some("记事本".to_string()),
                window_handle: Some("0x1234".to_string()),
            }),
            open_result_window_on_failure: true,
        }
    }

    #[test]
    fn auto_mode_prefers_native_replace_before_other_strategies() {
        let mut config = SystemInputConfig::default();
        config.writeback_mode = SystemInputWritebackMode::Auto;

        let payload = create_payload();
        let mut called = Vec::new();

        let result = write_translation_with_executor(&config, &payload, None, |strategy| {
            called.push(strategy.to_string());

            match strategy {
                "native-replace" => Ok(true),
                _ => Ok(false),
            }
        });

        assert!(result.success);
        assert_eq!(result.used_strategy, "native-replace");
        assert_eq!(called, vec!["native-replace"]);
    }

    #[test]
    fn auto_mode_falls_back_to_simulate_input_then_clipboard() {
        let mut config = SystemInputConfig::default();
        config.writeback_mode = SystemInputWritebackMode::Auto;
        config.enable_clipboard_fallback = true;

        let payload = create_payload();
        let mut called = Vec::new();

        let result = write_translation_with_executor(&config, &payload, None, |strategy| {
            called.push(strategy.to_string());

            match strategy {
                "native-replace" => Ok(false),
                "simulate-input" => Ok(false),
                "clipboard-paste" => Ok(true),
                _ => Ok(false),
            }
        });

        assert!(result.success);
        assert_eq!(result.used_strategy, "clipboard-paste");
        assert_eq!(
            called,
            vec![
                "native-replace".to_string(),
                "simulate-input".to_string(),
                "clipboard-paste".to_string()
            ]
        );
    }

    #[test]
    fn popup_only_short_circuits_without_executing_strategies() {
        let mut config = SystemInputConfig::default();
        config.writeback_mode = SystemInputWritebackMode::PopupOnly;

        let payload = create_payload();
        let mut called = false;

        let result = write_translation_with_executor(&config, &payload, None, |_strategy| {
            called = true;
            Ok(false)
        });

        assert!(!result.success);
        assert_eq!(result.used_strategy, "popup-only");
        assert!(result.fallback_window_required);
        assert!(!called);
    }

    #[test]
    fn auto_replace_disabled_short_circuits_to_popup() {
        let mut config = SystemInputConfig::default();
        config.auto_replace = false;

        let payload = create_payload();
        let mut called = false;

        let result = write_translation_with_executor(&config, &payload, None, |_strategy| {
            called = true;
            Ok(false)
        });

        assert!(!result.success);
        assert_eq!(result.used_strategy, "popup-only");
        assert!(!called);
    }

    #[test]
    fn native_replace_mode_does_not_use_clipboard_when_clipboard_fallback_disabled() {
        let mut config = SystemInputConfig::default();
        config.writeback_mode = SystemInputWritebackMode::NativeReplace;
        config.enable_clipboard_fallback = false;

        let payload = create_payload();
        let mut called = Vec::new();

        let result = write_translation_with_executor(&config, &payload, None, |strategy| {
            called.push(strategy.to_string());
            Ok(false)
        });

        assert!(!result.success);
        assert_eq!(result.used_strategy, "popup-only");
        assert_eq!(called, vec!["native-replace"]);
    }

    #[test]
    fn accumulates_strategy_errors_in_popup_message() {
        let mut config = SystemInputConfig::default();
        config.writeback_mode = SystemInputWritebackMode::Auto;
        config.enable_clipboard_fallback = true;

        let payload = create_payload();
        let mut responses = VecDeque::from([
            Err::<bool, String>("native failed".to_string()),
            Err::<bool, String>("simulate failed".to_string()),
            Ok(false),
        ]);

        let result = write_translation_with_executor(&config, &payload, None, |_strategy| {
            responses.pop_front().unwrap_or_else(|| Ok(false))
        });

        assert!(!result.success);
        assert_eq!(result.used_strategy, "popup-only");
        assert!(result
            .error
            .as_deref()
            .unwrap_or_default()
            .contains("native-replace: native failed"));
        assert!(result
            .error
            .as_deref()
            .unwrap_or_default()
            .contains("simulate-input: simulate failed"));
    }
}
