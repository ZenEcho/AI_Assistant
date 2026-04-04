use super::super::types::{
    SystemInputConfig, SystemInputPermissionState, SystemInputStatusPayload,
};

pub fn build_status(config: &SystemInputConfig) -> SystemInputStatusPayload {
    SystemInputStatusPayload {
        native_ready: false,
        active: false,
        platform: "linux-wayland".to_string(),
        permission_state: SystemInputPermissionState::NotRequired,
        last_error: if config.enabled {
            Some(
                "Wayland 对全局键盘监听和跨应用输入框操控限制很强，当前仅保留降级骨架。"
                    .to_string(),
            )
        } else {
            None
        },
        last_target_app: None,
    }
}
