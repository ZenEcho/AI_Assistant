use std::sync::Mutex;

use super::types::{
    SystemInputCancelSessionPayload, SystemInputConfig, SystemInputInitPayload,
    SystemInputStatusPayload, SystemInputTargetApp, SystemInputTranslationSubmitPayload,
    SystemInputWritebackResultPayload,
};

#[derive(Debug, Clone)]
pub struct SystemInputRuntimeState {
    pub config: SystemInputConfig,
    pub status: SystemInputStatusPayload,
    pub app_window_labels: Vec<String>,
    pub active_session_id: Option<String>,
}

impl Default for SystemInputRuntimeState {
    fn default() -> Self {
        Self {
            config: SystemInputConfig::default(),
            status: SystemInputStatusPayload::default(),
            app_window_labels: Vec::new(),
            active_session_id: None,
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
        payload: SystemInputInitPayload,
        status: SystemInputStatusPayload,
    ) -> Result<SystemInputStatusPayload, String> {
        let mut state = self
            .inner
            .lock()
            .map_err(|error| format!("system input state lock poisoned: {error}"))?;

        state.config = payload.config;
        state.app_window_labels = payload.app_window_labels;
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

    pub fn submit_translation(
        &self,
        payload: &SystemInputTranslationSubmitPayload,
        result: SystemInputWritebackResultPayload,
    ) -> Result<SystemInputWritebackResultPayload, String> {
        let mut state = self
            .inner
            .lock()
            .map_err(|error| format!("system input state lock poisoned: {error}"))?;

        if state.active_session_id.as_deref() != Some(payload.session_id.as_str()) {
            return Ok(result);
        }

        state.active_session_id = None;
        state.status.last_error = result.error.clone();

        Ok(result)
    }

    pub fn begin_session(
        &self,
        session_id: String,
        target_app: Option<SystemInputTargetApp>,
    ) -> Result<bool, String> {
        let mut state = self
            .inner
            .lock()
            .map_err(|error| format!("system input state lock poisoned: {error}"))?;

        if state.active_session_id.is_some() {
            return Ok(false);
        }

        state.active_session_id = Some(session_id);
        state.status.last_target_app = target_app;
        state.status.last_error = None;
        Ok(true)
    }

    pub fn cancel_session(&self, payload: &SystemInputCancelSessionPayload) -> Result<(), String> {
        let mut state = self
            .inner
            .lock()
            .map_err(|error| format!("system input state lock poisoned: {error}"))?;

        if state.active_session_id.as_deref() != Some(payload.session_id.as_str()) {
            return Ok(());
        }

        state.active_session_id = None;
        state.status.last_error = payload.error.clone();
        Ok(())
    }

    pub fn set_last_error(&self, error: Option<String>) -> Result<(), String> {
        let mut state = self
            .inner
            .lock()
            .map_err(|lock_error| format!("system input state lock poisoned: {lock_error}"))?;

        state.status.last_error = error;
        Ok(())
    }
}
