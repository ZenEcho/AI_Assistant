use super::super::types::{
    SystemInputConfig, SystemInputPermissionState, SystemInputStatusPayload,
};

pub fn build_status(config: &SystemInputConfig) -> SystemInputStatusPayload {
    SystemInputStatusPayload {
        native_ready: false,
        active: config.enabled,
        platform: "linux-wayland".to_string(),
        permission_state: SystemInputPermissionState::NotRequired,
        last_error: if config.enabled {
            Some("Wayland 版本尚未接入快捷输入原生能力。".to_string())
        } else {
            None
        },
    }
}
