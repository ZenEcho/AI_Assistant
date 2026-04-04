use super::super::types::{
    SystemInputConfig, SystemInputPermissionState, SystemInputStatusPayload,
};

pub fn build_status(config: &SystemInputConfig) -> SystemInputStatusPayload {
    SystemInputStatusPayload {
        native_ready: false,
        active: false,
        platform: "linux-x11".to_string(),
        permission_state: SystemInputPermissionState::NotRequired,
        last_error: if config.enabled {
            Some("Linux X11 版本计划提供降级实现，当前仅完成命令与状态骨架。".to_string())
        } else {
            None
        },
        last_target_app: None,
    }
}
