use super::super::types::{
    SystemInputConfig, SystemInputPermissionState, SystemInputStatusPayload,
};

pub fn build_status(config: &SystemInputConfig) -> SystemInputStatusPayload {
    SystemInputStatusPayload {
        native_ready: false,
        active: false,
        platform: "macos".to_string(),
        permission_state: SystemInputPermissionState::Unknown,
        last_error: if config.enabled {
            Some(
                "macOS 版本需要辅助功能权限与 AX/CGEventTap 接入，当前仅完成模块骨架。".to_string(),
            )
        } else {
            None
        },
        last_target_app: None,
    }
}
