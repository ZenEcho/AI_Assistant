use std::sync::Mutex;

use super::types::{SystemInputConfig, SystemInputStatusPayload};

#[derive(Debug, Clone)]
pub struct SystemInputRuntimeState {
    pub config: SystemInputConfig,
    pub status: SystemInputStatusPayload,
}

impl Default for SystemInputRuntimeState {
    fn default() -> Self {
        Self {
            config: SystemInputConfig::default(),
            status: SystemInputStatusPayload::default(),
        }
    }
}

#[derive(Default)]
pub struct SystemInputState {
    inner: Mutex<SystemInputRuntimeState>,
}

impl SystemInputState {
    pub fn snapshot(&self) -> Result<SystemInputRuntimeState, String> {
        self.inner
            .lock()
            .map(|state| state.clone())
            .map_err(|error| format!("system input state lock poisoned: {error}"))
    }

    pub fn initialize(
        &self,
        config: SystemInputConfig,
        status: SystemInputStatusPayload,
    ) -> Result<SystemInputStatusPayload, String> {
        let mut state = self
            .inner
            .lock()
            .map_err(|error| format!("system input state lock poisoned: {error}"))?;

        state.config = config;
        state.status = status.clone();

        Ok(status)
    }

    pub fn update_config(
        &self,
        config: SystemInputConfig,
        status: SystemInputStatusPayload,
    ) -> Result<SystemInputStatusPayload, String> {
        let mut state = self
            .inner
            .lock()
            .map_err(|error| format!("system input state lock poisoned: {error}"))?;

        state.config = config;
        state.status = status.clone();

        Ok(status)
    }
}
