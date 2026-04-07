use crate::storage_paths::{
    app_storage_root, legacy_app_data_dir, legacy_app_local_data_dir, normalized_relative_path,
    read_json_file, storage_path, write_json_file,
};
use serde_json::Value;
use std::path::Path;
use tauri::AppHandle;

const LEGACY_APP_DATA_PREFIX: &str = "app-data:";
const LEGACY_APP_LOCAL_DATA_PREFIX: &str = "app-local-data:";

#[tauri::command]
pub fn app_storage_get_root(app: AppHandle) -> Result<String, String> {
    Ok(app_storage_root(&app)?.display().to_string())
}

#[tauri::command]
pub fn app_storage_read_json(
    app: AppHandle,
    relative_path: String,
    legacy_relative_paths: Option<Vec<String>>,
) -> Result<Option<Value>, String> {
    let primary_path = storage_path(&app, &relative_path)?;

    if let Some(value) = read_json_file(&primary_path)? {
        return Ok(Some(value));
    }

    for legacy_relative_path in legacy_relative_paths.unwrap_or_default() {
        let legacy_path = resolve_legacy_path(&app, &legacy_relative_path)?;

        if let Some(value) = read_json_file(&legacy_path)? {
            write_json_file(&primary_path, &value)?;
            return Ok(Some(value));
        }
    }

    Ok(None)
}

#[tauri::command]
pub fn app_storage_write_json(
    app: AppHandle,
    relative_path: String,
    value: Value,
) -> Result<(), String> {
    let target_path = storage_path(&app, &relative_path)?;
    write_json_file(&target_path, &value)
}

fn resolve_legacy_path(app: &AppHandle, value: &str) -> Result<std::path::PathBuf, String> {
    if let Some(relative) = value.strip_prefix(LEGACY_APP_DATA_PREFIX) {
        return Ok(legacy_app_data_dir(app)?.join(normalized_relative_path(Path::new(relative))?));
    }

    if let Some(relative) = value.strip_prefix(LEGACY_APP_LOCAL_DATA_PREFIX) {
        return Ok(
            legacy_app_local_data_dir(app)?.join(normalized_relative_path(Path::new(relative))?)
        );
    }

    storage_path(app, value)
}
