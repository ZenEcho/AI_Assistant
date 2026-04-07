use serde_json::Value;
use std::{
    fs,
    path::{Component, Path, PathBuf},
};
use tauri::{AppHandle, Manager};

pub fn app_storage_root(_app: &AppHandle) -> Result<PathBuf, String> {
    let executable_path = std::env::current_exe()
        .map_err(|error| format!("Failed to resolve current executable path: {error}"))?;

    executable_path
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| {
            format!(
                "Failed to resolve application startup directory from {}",
                executable_path.display()
            )
        })
}

pub fn storage_path(app: &AppHandle, relative_path: impl AsRef<Path>) -> Result<PathBuf, String> {
    let normalized = normalized_relative_path(relative_path.as_ref())?;
    Ok(app_storage_root(app)?.join(normalized))
}

pub fn ensure_storage_dir(
    app: &AppHandle,
    relative_path: impl AsRef<Path>,
) -> Result<PathBuf, String> {
    let path = storage_path(app, relative_path)?;
    fs::create_dir_all(&path)
        .map_err(|error| format!("Failed to create directory {}: {error}", path.display()))?;
    Ok(path)
}

pub fn write_json_file(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create parent directory {}: {error}",
                parent.display()
            )
        })?;
    }

    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("Failed to serialize JSON to {}: {error}", path.display()))?;

    fs::write(path, bytes)
        .map_err(|error| format!("Failed to write JSON file {}: {error}", path.display()))
}

pub fn read_json_file(path: &Path) -> Result<Option<Value>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let bytes = fs::read(path)
        .map_err(|error| format!("Failed to read JSON file {}: {error}", path.display()))?;

    if bytes.is_empty() {
        return Ok(None);
    }

    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|error| format!("Failed to parse JSON file {}: {error}", path.display()))
}

pub fn legacy_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve legacy app data dir: {error}"))
}

pub fn legacy_app_local_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map_err(|error| format!("Failed to resolve legacy local app data dir: {error}"))
}

pub fn normalized_relative_path(path: &Path) -> Result<PathBuf, String> {
    if path.as_os_str().is_empty() {
        return Err("Storage path cannot be empty.".to_string());
    }

    let mut normalized = PathBuf::new();

    for component in path.components() {
        match component {
            Component::Normal(segment) => normalized.push(segment),
            Component::CurDir => {}
            _ => {
                return Err(format!(
                    "Storage path must be relative and stay inside the app startup directory: {}",
                    path.display()
                ));
            }
        }
    }

    if normalized.as_os_str().is_empty() {
        Err("Storage path cannot be empty.".to_string())
    } else {
        Ok(normalized)
    }
}

#[cfg(test)]
mod tests {
    use super::normalized_relative_path;
    use std::path::{Path, PathBuf};

    #[test]
    fn accepts_nested_relative_paths() {
        assert_eq!(
            normalized_relative_path(Path::new("ocr-engines/rapidocr")).unwrap(),
            PathBuf::from("ocr-engines").join("rapidocr")
        );
    }

    #[test]
    fn rejects_parent_segments() {
        assert!(normalized_relative_path(Path::new("../outside")).is_err());
    }

    #[test]
    fn rejects_absolute_paths() {
        assert!(normalized_relative_path(Path::new("C:/absolute")).is_err());
    }
}
