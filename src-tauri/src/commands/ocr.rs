use crate::storage_paths::{ensure_storage_dir, legacy_app_data_dir, legacy_app_local_data_dir};
use base64::Engine;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Read, Write},
    net::{Shutdown, TcpStream},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
};
use tauri::{AppHandle, Manager, State};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const DOWNLOAD_PROGRESS_CAP: u8 = 85;
const EXTRACTION_PROGRESS: u8 = 92;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OcrEngineId {
    Rapidocr,
    Paddleocr,
}

impl OcrEngineId {
    fn all() -> [Self; 2] {
        [Self::Rapidocr, Self::Paddleocr]
    }

    fn as_str(&self) -> &'static str {
        match self {
            Self::Rapidocr => "rapidocr",
            Self::Paddleocr => "paddleocr",
        }
    }

    fn manifest(&self) -> OcrEngineManifest {
        match self {
            Self::Rapidocr => OcrEngineManifest {
                version: "3.7.0-local.1",
                archive_name: "RapidOCR-json_v3.7.0-local.1_windows_x64.zip",
                download_url: "https://github.com/ZenEcho/RapidOCR/releases/download/v3.7.0-local.1/RapidOCR-json_v3.7.0-local.1_windows_x64.zip",
                executable_name: "RapidOCR-json.exe",
                startup_args: &["--ensureAscii=1"],
                init_tag: "OCR init completed.",
                pipe_tag: None,
                socket_tag: None,
                socket_prefix: "Socket init completed. ",
                required_paths: &[
                    "_internal/python314.dll",
                    "_internal/python3.dll",
                    "_internal/vcruntime140.dll",
                    "models/ch_PP-OCRv4_det_infer.onnx",
                    "models/ch_PP-OCRv4_rec_infer.onnx",
                    "models/ch_ppocr_mobile_v2.0_cls_infer.onnx",
                    "models/ppocr_keys_v1.txt",
                ],
            },
            Self::Paddleocr => OcrEngineManifest {
                version: "1.4.1",
                archive_name: "PaddleOCR-json_v1.4.1_windows_x64.7z",
                download_url: "https://github.com/hiroi-sora/PaddleOCR-json/releases/download/v1.4.1/PaddleOCR-json_v1.4.1_windows_x64.7z",
                executable_name: "PaddleOCR-json.exe",
                startup_args: &[],
                init_tag: "OCR init completed.",
                pipe_tag: Some("OCR anonymous pipe mode."),
                socket_tag: Some("OCR socket mode."),
                socket_prefix: "Socket init completed. ",
                required_paths: &[],
            },
        }
    }
}

#[derive(Debug, Clone)]
struct OcrEngineManifest {
    version: &'static str,
    archive_name: &'static str,
    download_url: &'static str,
    executable_name: &'static str,
    startup_args: &'static [&'static str],
    init_tag: &'static str,
    pipe_tag: Option<&'static str>,
    socket_tag: Option<&'static str>,
    socket_prefix: &'static str,
    required_paths: &'static [&'static str],
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OcrEngineInstallStatus {
    NotInstalled,
    Downloading,
    Installed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrEngineStatus {
    pub engine_id: OcrEngineId,
    pub status: OcrEngineInstallStatus,
    pub version: Option<String>,
    pub download_progress: Option<u8>,
    pub error_message: Option<String>,
    pub install_path: Option<String>,
}

#[derive(Debug, Default)]
pub struct OcrRuntimeState {
    statuses: Mutex<HashMap<OcrEngineId, OcrEngineStatus>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrBoundingBox {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrTextBlock {
    id: String,
    order: u32,
    source_text: String,
    score: f32,
    r#box: [[u32; 2]; 4],
    bbox: OcrBoundingBox,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrRecognitionResult {
    engine_id: OcrEngineId,
    engine_version: String,
    image_width: u32,
    image_height: u32,
    blocks: Vec<OcrTextBlock>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct OcrImagePayload {
    data_url: String,
    mime_type: String,
    name: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
struct RawOcrItem {
    r#box: [[f32; 2]; 4],
    score: f32,
    text: String,
}

#[derive(Debug, Clone, Deserialize)]
struct RawOcrResponse {
    code: i32,
    data: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OcrTransport {
    Pipe,
    Socket,
}

#[tauri::command]
pub async fn ocr_list_engine_statuses(
    app: AppHandle,
    state: State<'_, OcrRuntimeState>,
) -> Result<Vec<OcrEngineStatus>, String> {
    OcrEngineId::all()
        .into_iter()
        .map(|engine_id| resolve_public_engine_status(&app, &state, engine_id))
        .collect()
}

#[tauri::command]
pub async fn ocr_download_engine(
    app: AppHandle,
    state: State<'_, OcrRuntimeState>,
    engine_id: OcrEngineId,
) -> Result<OcrEngineStatus, String> {
    let installed_status = detect_installed_status(&app, engine_id)?;

    if installed_status.status == OcrEngineInstallStatus::Installed {
        update_runtime_status(
            &state,
            OcrEngineStatus {
                engine_id,
                status: OcrEngineInstallStatus::Installed,
                version: installed_status.version.clone(),
                download_progress: None,
                error_message: None,
                install_path: installed_status.install_path.clone(),
            },
        );
        return Ok(installed_status);
    }

    let current_runtime = get_runtime_status(&state, engine_id);
    if current_runtime
        .as_ref()
        .is_some_and(|status| status.status == OcrEngineInstallStatus::Downloading)
    {
        return Ok(current_runtime.unwrap());
    }

    let starting_status = OcrEngineStatus {
        engine_id,
        status: OcrEngineInstallStatus::Downloading,
        version: Some(engine_id.manifest().version.to_string()),
        download_progress: Some(0),
        error_message: None,
        install_path: None,
    };

    update_runtime_status(&state, starting_status.clone());

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = download_and_install_engine(app_handle.clone(), engine_id).await {
            let failed_status = OcrEngineStatus {
                engine_id,
                status: OcrEngineInstallStatus::Failed,
                version: Some(engine_id.manifest().version.to_string()),
                download_progress: None,
                error_message: Some(error),
                install_path: None,
            };
            update_runtime_status(app_handle.state::<OcrRuntimeState>().inner(), failed_status);
        }
    });

    Ok(starting_status)
}

#[tauri::command]
pub async fn ocr_recognize_image(
    app: AppHandle,
    engine_id: OcrEngineId,
    image: OcrImagePayload,
) -> Result<OcrRecognitionResult, String> {
    let executable_path = resolve_engine_executable(&app, engine_id)?;

    tauri::async_runtime::spawn_blocking(move || {
        recognize_with_engine(engine_id, &executable_path, image)
    })
    .await
    .map_err(|error| format!("OCR task join failed: {error}"))?
}

async fn download_and_install_engine(app: AppHandle, engine_id: OcrEngineId) -> Result<(), String> {
    let manifest = engine_id.manifest();
    let engine_root = preferred_engine_root_dir(&app, engine_id)?;
    let temp_root = engine_root.join(format!("{}.tmp", manifest.version));
    let archive_path = temp_root.join(manifest.archive_name);
    let extracted_root = temp_root.join("extracted");
    let install_root = engine_root.join(manifest.version);

    if temp_root.exists() {
        fs::remove_dir_all(&temp_root)
            .map_err(|error| format!("Failed to clear OCR temp directory: {error}"))?;
    }

    fs::create_dir_all(&temp_root)
        .map_err(|error| format!("Failed to create OCR temp directory: {error}"))?;

    update_progress(&app, engine_id, 2);

    let client = reqwest::Client::builder()
        .build()
        .map_err(|error| format!("Failed to create OCR download client: {error}"))?;
    let response = client
        .get(manifest.download_url)
        .header(reqwest::header::USER_AGENT, "AI-Translation-Desktop")
        .send()
        .await
        .map_err(|error| format!("Failed to download OCR engine: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download OCR engine: HTTP {}",
            response.status()
        ));
    }

    let total_bytes = response.content_length();
    let mut downloaded_bytes = 0u64;
    let mut archive_file = fs::File::create(&archive_path)
        .map_err(|error| format!("Failed to create OCR archive file: {error}"))?;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|error| format!("Failed to read OCR download stream: {error}"))?;
        archive_file
            .write_all(&chunk)
            .map_err(|error| format!("Failed to write OCR archive file: {error}"))?;
        downloaded_bytes += chunk.len() as u64;

        if let Some(total) = total_bytes {
            let progress = ((downloaded_bytes as f64 / total as f64) * DOWNLOAD_PROGRESS_CAP as f64)
                .round()
                .clamp(0.0, DOWNLOAD_PROGRESS_CAP as f64) as u8;
            update_progress(&app, engine_id, progress);
        }
    }

    archive_file
        .flush()
        .map_err(|error| format!("Failed to flush OCR archive file: {error}"))?;

    update_progress(&app, engine_id, EXTRACTION_PROGRESS);
    fs::create_dir_all(&extracted_root)
        .map_err(|error| format!("Failed to prepare OCR extraction directory: {error}"))?;

    let archive_path_for_extract = archive_path.clone();
    let extracted_root_for_extract = extracted_root.clone();
    tauri::async_runtime::spawn_blocking(move || {
        extract_archive_file(&archive_path_for_extract, &extracted_root_for_extract)
    })
    .await
    .map_err(|error| format!("OCR extraction join failed: {error}"))??;

    if install_root.exists() {
        fs::remove_dir_all(&install_root)
            .map_err(|error| format!("Failed to replace OCR install directory: {error}"))?;
    }

    fs::rename(&extracted_root, &install_root)
        .map_err(|error| format!("Failed to finalize OCR install directory: {error}"))?;

    if temp_root.exists() {
        let _ = fs::remove_dir_all(&temp_root);
    }

    let executable_path = find_executable_recursive(&install_root, manifest.executable_name)
        .ok_or_else(|| {
            format!(
                "Installed OCR engine is missing {}",
                manifest.executable_name
            )
        })?;

    if !executable_path.exists() {
        return Err("OCR executable was not found after installation.".to_string());
    }

    update_runtime_status(
        app.state::<OcrRuntimeState>().inner(),
        OcrEngineStatus {
            engine_id,
            status: OcrEngineInstallStatus::Installed,
            version: Some(manifest.version.to_string()),
            download_progress: None,
            error_message: None,
            install_path: executable_path
                .parent()
                .map(|path| path.display().to_string()),
        },
    );

    Ok(())
}

fn recognize_with_engine(
    engine_id: OcrEngineId,
    executable_path: &Path,
    image: OcrImagePayload,
) -> Result<OcrRecognitionResult, String> {
    let manifest = engine_id.manifest();
    let image_base64 = extract_image_base64(&image.data_url)?;
    let transport = startup_transport(engine_id);
    let request_payload = format!("{}\n", json!({ "image_base64": image_base64 }));

    let mut child = build_ocr_command(executable_path, &manifest)?
        .spawn()
        .map_err(|error| format!("Failed to start OCR engine: {error}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "OCR engine stdout is unavailable.".to_string())?;
    let mut stdout_reader = BufReader::new(stdout);
    let detected_transport = wait_for_engine_init(&mut stdout_reader, &manifest, transport)?;
    let response_text = match detected_transport {
        OcrTransport::Pipe => {
            let stdin = child
                .stdin
                .as_mut()
                .ok_or_else(|| "OCR engine stdin is unavailable.".to_string())?;
            stdin
                .write_all(request_payload.as_bytes())
                .map_err(|error| format!("Failed to send OCR request: {error}"))?;
            stdin
                .flush()
                .map_err(|error| format!("Failed to flush OCR request: {error}"))?;
            read_pipe_response(&mut stdout_reader)?
        }
        OcrTransport::Socket => {
            let (host, port) = wait_for_socket_ready(&mut stdout_reader, &manifest)?;
            let mut stream = TcpStream::connect((host.as_str(), port))
                .map_err(|error| format!("Failed to connect to OCR socket: {error}"))?;
            stream
                .write_all(request_payload.as_bytes())
                .map_err(|error| format!("Failed to send OCR socket request: {error}"))?;
            let _ = stream.shutdown(Shutdown::Write);
            let mut response = String::new();
            stream
                .read_to_string(&mut response)
                .map_err(|error| format!("Failed to read OCR socket response: {error}"))?;
            response
        }
    };

    let _ = child.kill();
    let _ = child.wait();

    parse_ocr_response(engine_id, &manifest, image, &response_text)
}

fn startup_transport(engine_id: OcrEngineId) -> OcrTransport {
    match engine_id {
        OcrEngineId::Rapidocr => OcrTransport::Pipe,
        OcrEngineId::Paddleocr => OcrTransport::Pipe,
    }
}

fn build_ocr_command(
    executable_path: &Path,
    manifest: &OcrEngineManifest,
) -> Result<Command, String> {
    let parent_dir = executable_path
        .parent()
        .ok_or_else(|| "OCR executable directory is invalid.".to_string())?;
    let mut command = Command::new(executable_path);
    command
        .args(manifest.startup_args)
        .current_dir(parent_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    Ok(command)
}

fn wait_for_engine_init(
    reader: &mut BufReader<std::process::ChildStdout>,
    manifest: &OcrEngineManifest,
    fallback_transport: OcrTransport,
) -> Result<OcrTransport, String> {
    let mut transport = fallback_transport;

    loop {
        let line = read_line(reader)?;
        if let Some(pipe_tag) = manifest.pipe_tag {
            if line.contains(pipe_tag) {
                transport = OcrTransport::Pipe;
            }
        }
        if let Some(socket_tag) = manifest.socket_tag {
            if line.contains(socket_tag) {
                transport = OcrTransport::Socket;
            }
        }
        if line.contains(manifest.init_tag) {
            return Ok(transport);
        }
    }
}

fn wait_for_socket_ready(
    reader: &mut BufReader<std::process::ChildStdout>,
    manifest: &OcrEngineManifest,
) -> Result<(String, u16), String> {
    loop {
        let line = read_line(reader)?;
        if let Some(socket) = line.trim().strip_prefix(manifest.socket_prefix) {
            let mut parts = socket.split(':');
            let host = parts
                .next()
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "OCR socket host is missing.".to_string())?;
            let port = parts
                .next()
                .ok_or_else(|| "OCR socket port is missing.".to_string())?
                .parse::<u16>()
                .map_err(|error| format!("Invalid OCR socket port: {error}"))?;
            return Ok((host.to_string(), port));
        }
    }
}

fn read_pipe_response(reader: &mut BufReader<std::process::ChildStdout>) -> Result<String, String> {
    let mut response = String::new();

    loop {
        let line = read_line(reader)?;
        let trimmed = line.trim();
        if response.is_empty() && !trimmed.starts_with('{') {
            continue;
        }

        response.push_str(&line);
        if serde_json::from_str::<Value>(response.trim()).is_ok() {
            return Ok(response);
        }
    }
}

fn parse_ocr_response(
    engine_id: OcrEngineId,
    manifest: &OcrEngineManifest,
    image: OcrImagePayload,
    response_text: &str,
) -> Result<OcrRecognitionResult, String> {
    let response: RawOcrResponse = serde_json::from_str(response_text.trim())
        .map_err(|error| format!("Invalid OCR response payload: {error}"))?;

    if response.code != 100 {
        return Err(match response.data {
            Value::String(message) if !message.trim().is_empty() => message,
            _ => format!("OCR engine returned code {}", response.code),
        });
    }

    let raw_items: Vec<RawOcrItem> = serde_json::from_value(response.data)
        .map_err(|error| format!("Invalid OCR item payload: {error}"))?;

    let mut max_x = 1u32;
    let mut max_y = 1u32;
    let blocks = raw_items
        .into_iter()
        .enumerate()
        .map(|(index, item)| {
            let normalized_box = item.r#box.map(|point| {
                let x = point[0].round().max(0.0) as u32;
                let y = point[1].round().max(0.0) as u32;
                max_x = max_x.max(x);
                max_y = max_y.max(y);
                [x, y]
            });
            let bbox = build_bbox(&normalized_box);

            OcrTextBlock {
                id: format!("{}-{}", engine_id.as_str(), index),
                order: index as u32,
                source_text: item.text,
                score: item.score,
                r#box: normalized_box,
                bbox,
            }
        })
        .collect::<Vec<_>>();

    Ok(OcrRecognitionResult {
        engine_id,
        engine_version: manifest.version.to_string(),
        image_width: image.width.unwrap_or(max_x.max(1)),
        image_height: image.height.unwrap_or(max_y.max(1)),
        blocks,
    })
}

fn build_bbox(points: &[[u32; 2]; 4]) -> OcrBoundingBox {
    let min_x = points.iter().map(|point| point[0]).min().unwrap_or(0);
    let min_y = points.iter().map(|point| point[1]).min().unwrap_or(0);
    let max_x = points.iter().map(|point| point[0]).max().unwrap_or(min_x);
    let max_y = points.iter().map(|point| point[1]).max().unwrap_or(min_y);

    OcrBoundingBox {
        x: min_x,
        y: min_y,
        width: max_x.saturating_sub(min_x).max(1),
        height: max_y.saturating_sub(min_y).max(1),
    }
}

fn read_line(reader: &mut BufReader<std::process::ChildStdout>) -> Result<String, String> {
    let mut line = String::new();
    let bytes = reader
        .read_line(&mut line)
        .map_err(|error| format!("Failed to read OCR process output: {error}"))?;

    if bytes == 0 {
        return Err("OCR engine terminated before returning a result.".to_string());
    }

    Ok(line)
}

fn extract_image_base64(data_url: &str) -> Result<String, String> {
    let payload = data_url
        .split_once(',')
        .map(|(_, payload)| payload.trim())
        .filter(|payload| !payload.is_empty())
        .ok_or_else(|| "Image data URL is invalid.".to_string())?;

    base64::engine::general_purpose::STANDARD
        .decode(payload)
        .map_err(|error| format!("Image data URL base64 is invalid: {error}"))?;

    Ok(payload.to_string())
}

fn resolve_public_engine_status(
    app: &AppHandle,
    state: &OcrRuntimeState,
    engine_id: OcrEngineId,
) -> Result<OcrEngineStatus, String> {
    let detected = detect_installed_status(app, engine_id)?;

    Ok(match get_runtime_status(state, engine_id) {
        Some(runtime)
            if runtime.status == OcrEngineInstallStatus::Downloading
                || runtime.status == OcrEngineInstallStatus::Failed =>
        {
            runtime
        }
        Some(runtime) if runtime.status == OcrEngineInstallStatus::Installed => runtime,
        _ => detected,
    })
}

fn detect_installed_status(
    app: &AppHandle,
    engine_id: OcrEngineId,
) -> Result<OcrEngineStatus, String> {
    let manifest = engine_id.manifest();
    let executable_path = find_installed_engine_executable(app, engine_id, &manifest)?;

    Ok(
        if executable_path
            .as_ref()
            .is_some_and(|path| validate_engine_bundle(path, &manifest))
        {
            OcrEngineStatus {
                engine_id,
                status: OcrEngineInstallStatus::Installed,
                version: Some(manifest.version.to_string()),
                download_progress: None,
                error_message: None,
                install_path: executable_path
                    .as_ref()
                    .and_then(|path| path.parent())
                    .map(|path| path.display().to_string()),
            }
        } else {
            OcrEngineStatus {
                engine_id,
                status: OcrEngineInstallStatus::NotInstalled,
                version: None,
                download_progress: None,
                error_message: None,
                install_path: None,
            }
        },
    )
}

fn resolve_engine_executable(app: &AppHandle, engine_id: OcrEngineId) -> Result<PathBuf, String> {
    let manifest = engine_id.manifest();
    let executable_path =
        find_installed_engine_executable(app, engine_id, &manifest)?.ok_or_else(|| {
            format!(
                "{} is not installed. Please download the OCR engine first.",
                manifest.executable_name
            )
        })?;

    if validate_engine_bundle(&executable_path, &manifest) {
        Ok(executable_path)
    } else {
        Err(format!(
            "{} installation is incomplete. Please download the OCR engine again.",
            manifest.executable_name
        ))
    }
}

fn preferred_engine_root_dir(app: &AppHandle, engine_id: OcrEngineId) -> Result<PathBuf, String> {
    ensure_storage_dir(app, Path::new("ocr-engines").join(engine_id.as_str()))
}

fn legacy_engine_root_dir_candidates(
    app: &AppHandle,
    engine_id: OcrEngineId,
) -> Result<Vec<PathBuf>, String> {
    let mut roots = Vec::new();

    let local_root = legacy_app_local_data_dir(app)?
        .join("ocr-engines")
        .join(engine_id.as_str());
    roots.push(local_root);

    let roaming_root = legacy_app_data_dir(app)?
        .join("ocr-engines")
        .join(engine_id.as_str());
    if !roots.contains(&roaming_root) {
        roots.push(roaming_root);
    }

    Ok(roots)
}

fn find_installed_engine_executable(
    app: &AppHandle,
    engine_id: OcrEngineId,
    manifest: &OcrEngineManifest,
) -> Result<Option<PathBuf>, String> {
    let install_root = preferred_engine_root_dir(app, engine_id)?.join(manifest.version);
    let executable_path = find_executable_recursive(&install_root, manifest.executable_name);
    if executable_path
        .as_ref()
        .is_some_and(|path| validate_engine_bundle(path, manifest))
    {
        return Ok(executable_path);
    }

    migrate_legacy_engine_installation(app, engine_id, manifest)
}

fn migrate_legacy_engine_installation(
    app: &AppHandle,
    engine_id: OcrEngineId,
    manifest: &OcrEngineManifest,
) -> Result<Option<PathBuf>, String> {
    let destination_root = preferred_engine_root_dir(app, engine_id)?;
    let destination_install_root = destination_root.join(manifest.version);

    for legacy_root in legacy_engine_root_dir_candidates(app, engine_id)? {
        let legacy_install_root = legacy_root.join(manifest.version);
        let legacy_executable =
            find_executable_recursive(&legacy_install_root, manifest.executable_name);

        if !legacy_executable
            .as_ref()
            .is_some_and(|path| validate_engine_bundle(path, manifest))
        {
            continue;
        }

        if destination_install_root.exists() {
            fs::remove_dir_all(&destination_install_root).map_err(|error| {
                format!(
                    "Failed to replace stale OCR installation at {}: {error}",
                    destination_install_root.display()
                )
            })?;
        }

        move_or_copy_dir_all(&legacy_install_root, &destination_install_root)?;

        let migrated_executable =
            find_executable_recursive(&destination_install_root, manifest.executable_name);

        if migrated_executable
            .as_ref()
            .is_some_and(|path| validate_engine_bundle(path, manifest))
        {
            return Ok(migrated_executable);
        }

        return Err(format!(
            "Failed to migrate {} into the app startup directory.",
            manifest.executable_name
        ));
    }

    Ok(None)
}

fn find_executable_recursive(root: &Path, executable_name: &str) -> Option<PathBuf> {
    if !root.exists() {
        return None;
    }

    let mut stack = vec![root.to_path_buf()];

    while let Some(path) = stack.pop() {
        let entries = fs::read_dir(&path).ok()?;
        for entry in entries.flatten() {
            let entry_path = entry.path();

            if entry_path.is_dir() {
                stack.push(entry_path);
                continue;
            }

            if entry_path
                .file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.eq_ignore_ascii_case(executable_name))
            {
                return Some(entry_path);
            }
        }
    }

    None
}

fn move_or_copy_dir_all(source: &Path, destination: &Path) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create OCR destination directory {}: {error}",
                parent.display()
            )
        })?;
    }

    match fs::rename(source, destination) {
        Ok(()) => Ok(()),
        Err(rename_error) => {
            copy_dir_all(source, destination)?;
            fs::remove_dir_all(source).map_err(|cleanup_error| {
                format!(
                    "Failed to clean up legacy OCR directory {} after copy fallback (rename error: {rename_error}; cleanup error: {cleanup_error})",
                    source.display()
                )
            })
        }
    }
}

fn copy_dir_all(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| {
        format!(
            "Failed to create OCR directory {}: {error}",
            destination.display()
        )
    })?;

    let entries = fs::read_dir(source)
        .map_err(|error| format!("Failed to read OCR directory {}: {error}", source.display()))?;

    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "Failed to enumerate OCR directory {}: {error}",
                source.display()
            )
        })?;
        let entry_path = entry.path();
        let destination_path = destination.join(entry.file_name());

        if entry_path.is_dir() {
            copy_dir_all(&entry_path, &destination_path)?;
        } else {
            fs::copy(&entry_path, &destination_path).map_err(|error| {
                format!(
                    "Failed to copy OCR file {} to {}: {error}",
                    entry_path.display(),
                    destination_path.display()
                )
            })?;
        }
    }

    Ok(())
}

fn validate_engine_bundle(executable_path: &Path, manifest: &OcrEngineManifest) -> bool {
    let Some(bundle_root) = executable_path.parent() else {
        return false;
    };

    manifest
        .required_paths
        .iter()
        .all(|relative_path| bundle_root.join(relative_path).exists())
}

fn extract_archive_file(archive_path: &Path, output_dir: &Path) -> Result<(), String> {
    match archive_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("zip") => extract_zip_archive(archive_path, output_dir),
        Some("7z") => sevenz_rust::decompress_file(archive_path, output_dir)
            .map_err(|error| format!("Failed to extract OCR engine archive: {error}")),
        Some(other) => Err(format!("Unsupported OCR archive format: {other}")),
        None => Err("OCR archive extension is missing.".to_string()),
    }
}

fn extract_zip_archive(archive_path: &Path, output_dir: &Path) -> Result<(), String> {
    let archive_file = fs::File::open(archive_path)
        .map_err(|error| format!("Failed to open OCR zip archive: {error}"))?;
    let mut archive = zip::ZipArchive::new(archive_file)
        .map_err(|error| format!("Failed to read OCR zip archive: {error}"))?;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Failed to read OCR zip entry: {error}"))?;
        let entry_name = entry.name().to_string();
        let relative_path = entry
            .enclosed_name()
            .map(|value| value.to_path_buf())
            .ok_or_else(|| format!("Unsafe OCR zip entry path: {entry_name}"))?;
        let destination_path = output_dir.join(relative_path);

        if entry.is_dir() {
            fs::create_dir_all(&destination_path)
                .map_err(|error| format!("Failed to create OCR directory from zip: {error}"))?;
            continue;
        }

        if let Some(parent) = destination_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Failed to prepare OCR zip parent directory: {error}"))?;
        }

        let mut destination_file = fs::File::create(&destination_path)
            .map_err(|error| format!("Failed to create OCR file from zip: {error}"))?;
        std::io::copy(&mut entry, &mut destination_file)
            .map_err(|error| format!("Failed to extract OCR zip entry: {error}"))?;
        destination_file
            .flush()
            .map_err(|error| format!("Failed to flush OCR zip file: {error}"))?;
    }

    Ok(())
}

fn update_progress(app: &AppHandle, engine_id: OcrEngineId, progress: u8) {
    update_runtime_status(
        app.state::<OcrRuntimeState>().inner(),
        OcrEngineStatus {
            engine_id,
            status: OcrEngineInstallStatus::Downloading,
            version: Some(engine_id.manifest().version.to_string()),
            download_progress: Some(progress.min(99)),
            error_message: None,
            install_path: None,
        },
    );
}

fn get_runtime_status(state: &OcrRuntimeState, engine_id: OcrEngineId) -> Option<OcrEngineStatus> {
    state
        .statuses
        .lock()
        .ok()
        .and_then(|statuses| statuses.get(&engine_id).cloned())
}

fn update_runtime_status(state: &OcrRuntimeState, status: OcrEngineStatus) {
    if let Ok(mut statuses) = state.statuses.lock() {
        statuses.insert(status.engine_id, status);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_bbox, extract_archive_file, extract_image_base64, find_executable_recursive,
        recognize_with_engine, OcrBoundingBox, OcrEngineId, OcrImagePayload, OcrRecognitionResult,
    };
    use base64::Engine;
    use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, CONTENT_TYPE};
    use serde::{Deserialize, Serialize};
    use serde_json::Value;
    use std::{
        env,
        ffi::OsString,
        fs,
        io::{Read, Write},
        path::{Path, PathBuf},
        sync::{Mutex, MutexGuard, OnceLock},
        time::{SystemTime, UNIX_EPOCH},
    };

    const DEFAULT_TRANSLATION_SYSTEM_PROMPT: &str =
        "You are a professional translation engine. Translate accurately, keep the original tone, preserve structure and line breaks, and return only the translated text.";

    #[derive(Debug, Clone, PartialEq, Eq)]
    struct ManualAiConfig {
        base_url: String,
        api_key: String,
        model: String,
        system_prompt: String,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ManualTranslatedBlock {
        block_id: String,
        source_text: String,
        translated_text: String,
        bbox: OcrBoundingBox,
    }

    #[derive(Debug, Deserialize)]
    struct StoredAppConfigDocument {
        #[serde(rename = "app-config")]
        app_config: StoredAppConfig,
    }

    #[derive(Debug, Deserialize)]
    struct StoredAppConfig {
        preferences: StoredPreferences,
        models: Vec<StoredModelConfig>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct StoredPreferences {
        selected_translation_model_id: Option<String>,
    }

    #[derive(Debug, Clone, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct StoredModelConfig {
        id: String,
        base_url: String,
        api_key: String,
        model: String,
        enabled: bool,
        is_default: bool,
        system_prompt: String,
    }

    struct ScopedEnvGuard {
        _lock: MutexGuard<'static, ()>,
        values: Vec<(String, Option<OsString>)>,
    }

    impl ScopedEnvGuard {
        fn set_many(values: &[(&str, Option<&str>)]) -> Self {
            let lock = env_lock().lock().expect("env lock should be available");
            let mut previous_values = Vec::with_capacity(values.len());

            for (key, value) in values {
                previous_values.push(((*key).to_string(), env::var_os(key)));
                match value {
                    Some(next) => env::set_var(key, next),
                    None => env::remove_var(key),
                }
            }

            Self {
                _lock: lock,
                values: previous_values,
            }
        }
    }

    impl Drop for ScopedEnvGuard {
        fn drop(&mut self) {
            for (key, previous_value) in self.values.drain(..).rev() {
                match previous_value {
                    Some(value) => env::set_var(&key, value),
                    None => env::remove_var(&key),
                }
            }
        }
    }

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn unique_temp_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "ai-translation-{name}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        ))
    }

    fn repo_root_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("repo root should exist")
            .to_path_buf()
    }

    fn default_manual_output_dir() -> PathBuf {
        repo_root_dir()
            .join("artifacts")
            .join("manual-image-translation")
            .join(format!(
                "{}",
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis()
            ))
    }

    async fn install_engine_for_manual_test(
        engine_id: OcrEngineId,
        root: &std::path::Path,
    ) -> Result<PathBuf, String> {
        let manifest = engine_id.manifest();
        let archive_path = root.join(manifest.archive_name);
        let extract_root = root.join("extract");

        fs::create_dir_all(root)
            .map_err(|error| format!("Failed to create manual OCR test root: {error}"))?;

        let client = reqwest::Client::builder()
            .build()
            .map_err(|error| format!("Failed to create manual OCR test client: {error}"))?;
        let bytes = client
            .get(manifest.download_url)
            .header(reqwest::header::USER_AGENT, "AI-Translation-Desktop")
            .send()
            .await
            .map_err(|error| format!("Failed to download manual OCR archive: {error}"))?
            .bytes()
            .await
            .map_err(|error| format!("Failed to read manual OCR archive bytes: {error}"))?;

        fs::write(&archive_path, &bytes)
            .map_err(|error| format!("Failed to persist manual OCR archive: {error}"))?;
        fs::create_dir_all(&extract_root)
            .map_err(|error| format!("Failed to create manual OCR extract root: {error}"))?;
        extract_archive_file(&archive_path, &extract_root)
            .map_err(|error| format!("Failed to extract manual OCR archive: {error}"))?;

        find_executable_recursive(&extract_root, manifest.executable_name).ok_or_else(|| {
            format!(
                "Manual OCR executable {} was not found.",
                manifest.executable_name
            )
        })
    }

    fn load_fixture_payload() -> Result<OcrImagePayload, String> {
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("ocr-sample.png");
        load_image_payload_from_path(&fixture_path)
    }

    fn load_image_payload_from_path(path: &Path) -> Result<OcrImagePayload, String> {
        let bytes =
            fs::read(path).map_err(|error| format!("Failed to read OCR image fixture: {error}"))?;
        let base64 = base64::engine::general_purpose::STANDARD.encode(bytes);
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .unwrap_or_default();
        let mime_type = match extension.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            "bmp" => "image/bmp",
            _ => "image/png",
        };
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("ocr-image")
            .to_string();

        Ok(OcrImagePayload {
            data_url: format!("data:{mime_type};base64,{base64}"),
            mime_type: mime_type.to_string(),
            name: Some(name),
            width: env::var("AI_TRANSLATION_E2E_IMAGE_WIDTH")
                .ok()
                .and_then(|value| value.parse::<u32>().ok())
                .or(if extension == "png" { Some(960) } else { None }),
            height: env::var("AI_TRANSLATION_E2E_IMAGE_HEIGHT")
                .ok()
                .and_then(|value| value.parse::<u32>().ok())
                .or(if extension == "png" { Some(320) } else { None }),
        })
    }

    fn build_translation_user_message(
        source_text: &str,
        source_language: &str,
        target_language: &str,
    ) -> String {
        let source_language_line = if source_language.trim().eq_ignore_ascii_case("auto") {
            "Automatically detect the source language.".to_string()
        } else {
            format!("The source language is {}.", source_language.trim())
        };

        [
            format!("Translate the following content into {target_language}."),
            source_language_line,
            "Keep the original structure, punctuation, markdown, lists and line breaks."
                .to_string(),
            "Return the translated text only. Do not add explanations or quotation marks."
                .to_string(),
            String::new(),
            "Text:".to_string(),
            source_text.to_string(),
        ]
        .join("\n")
    }

    fn extract_chat_content(value: &Value) -> Option<String> {
        match value {
            Value::String(text) => Some(text.to_string()),
            Value::Array(parts) => {
                let content = parts
                    .iter()
                    .filter_map(|part| {
                        part.get("text")
                            .and_then(Value::as_str)
                            .or_else(|| part.get("content").and_then(Value::as_str))
                    })
                    .collect::<Vec<_>>()
                    .join("");

                if content.is_empty() {
                    None
                } else {
                    Some(content)
                }
            }
            _ => None,
        }
    }

    fn extract_completion_content(raw: &Value) -> Result<String, String> {
        raw.pointer("/choices/0/message/content")
            .and_then(extract_chat_content)
            .or_else(|| raw.get("content").and_then(extract_chat_content))
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "AI provider returned no translated text.".to_string())
    }

    fn parse_ai_error(raw: &Value) -> Option<String> {
        raw.get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .or_else(|| raw.get("message").and_then(Value::as_str))
            .map(str::to_string)
    }

    fn resolve_manual_ai_config() -> Result<ManualAiConfig, String> {
        let env_base_url = env::var("AI_TRANSLATION_BASE_URL").ok();
        let env_model = env::var("AI_TRANSLATION_MODEL").ok();
        let env_api_key = env::var("AI_TRANSLATION_API_KEY").unwrap_or_default();
        let env_system_prompt = env::var("AI_TRANSLATION_SYSTEM_PROMPT")
            .unwrap_or_else(|_| DEFAULT_TRANSLATION_SYSTEM_PROMPT.to_string());

        if let (Some(base_url), Some(model)) = (env_base_url, env_model) {
            if !base_url.trim().is_empty() && !model.trim().is_empty() {
                return Ok(ManualAiConfig {
                    base_url,
                    api_key: env_api_key,
                    model,
                    system_prompt: env_system_prompt,
                });
            }
        }

        let app_config_path = env::var("AI_TRANSLATION_APP_CONFIG_PATH")
            .map(PathBuf::from)
            .or_else(|_| {
                env::var("APPDATA")
                    .map(PathBuf::from)
                    .map(|root| root.join("com.ai.translation").join("app-config.json"))
            })
            .map_err(|_| {
                "No AI config found. Set AI_TRANSLATION_BASE_URL and AI_TRANSLATION_MODEL, or configure an enabled model in the app."
                    .to_string()
            })?;

        let raw_bytes = fs::read(&app_config_path).map_err(|error| {
            format!(
                "Failed to read AI app config at {}: {error}",
                app_config_path.display()
            )
        })?;
        let document: StoredAppConfigDocument = serde_json::from_slice(&raw_bytes)
            .map_err(|error| format!("Invalid AI app config JSON: {error}"))?;
        let selected_id = document
            .app_config
            .preferences
            .selected_translation_model_id
            .as_deref();
        let enabled_models = document
            .app_config
            .models
            .iter()
            .filter(|model| model.enabled)
            .collect::<Vec<_>>();

        let selected_model = selected_id
            .and_then(|id| enabled_models.iter().find(|model| model.id == id).copied())
            .or_else(|| enabled_models.iter().find(|model| model.is_default).copied())
            .or_else(|| enabled_models.first().copied())
            .ok_or_else(|| {
                format!(
                    "No enabled AI model found in {}. Enable one model in settings or set AI_TRANSLATION_BASE_URL / AI_TRANSLATION_MODEL.",
                    app_config_path.display()
                )
            })?;

        Ok(ManualAiConfig {
            base_url: selected_model.base_url.clone(),
            api_key: selected_model.api_key.clone(),
            model: selected_model.model.clone(),
            system_prompt: if selected_model.system_prompt.trim().is_empty() {
                DEFAULT_TRANSLATION_SYSTEM_PROMPT.to_string()
            } else {
                selected_model.system_prompt.clone()
            },
        })
    }

    async fn translate_block_with_ai(
        config: &ManualAiConfig,
        source_text: &str,
        source_language: &str,
        target_language: &str,
    ) -> Result<String, String> {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));

        if !config.api_key.trim().is_empty() {
            let auth = format!("Bearer {}", config.api_key.trim());
            let auth_header = HeaderValue::from_str(&auth)
                .map_err(|error| format!("Invalid AI auth header: {error}"))?;
            headers.insert(AUTHORIZATION, auth_header);
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(90))
            .build()
            .map_err(|error| format!("Failed to create AI request client: {error}"))?;
        let response = client
            .post(format!(
                "{}/chat/completions",
                config.base_url.trim_end_matches('/')
            ))
            .headers(headers)
            .json(&serde_json::json!({
                "model": config.model,
                "stream": false,
                "messages": [
                    {
                        "role": "system",
                        "content": config.system_prompt,
                    },
                    {
                        "role": "user",
                        "content": build_translation_user_message(
                            source_text,
                            source_language,
                            target_language,
                        ),
                    }
                ],
            }))
            .send()
            .await
            .map_err(|error| format!("AI translation request failed: {error}"))?;

        let status = response.status();
        let raw: Value = response
            .json()
            .await
            .map_err(|error| format!("Invalid AI translation response: {error}"))?;

        if !status.is_success() {
            return Err(parse_ai_error(&raw)
                .unwrap_or_else(|| format!("AI provider returned HTTP {status}")));
        }

        if let Some(error_message) = parse_ai_error(&raw) {
            return Err(error_message);
        }

        extract_completion_content(&raw)
    }

    fn resolve_manual_ocr_engine() -> Result<OcrEngineId, String> {
        match env::var("AI_TRANSLATION_OCR_ENGINE")
            .unwrap_or_else(|_| "rapidocr".to_string())
            .to_ascii_lowercase()
            .as_str()
        {
            "rapidocr" => Ok(OcrEngineId::Rapidocr),
            "paddleocr" => Ok(OcrEngineId::Paddleocr),
            other => Err(format!("Unsupported AI_TRANSLATION_OCR_ENGINE: {other}")),
        }
    }

    fn resolve_manual_image_payload() -> Result<OcrImagePayload, String> {
        match env::var("AI_TRANSLATION_E2E_IMAGE_PATH") {
            Ok(path) if !path.trim().is_empty() => {
                load_image_payload_from_path(Path::new(path.trim()))
            }
            _ => load_fixture_payload(),
        }
    }

    fn resolve_manual_output_dir() -> Result<PathBuf, String> {
        let output_dir = match env::var("AI_TRANSLATION_E2E_OUTPUT_DIR") {
            Ok(path) if !path.trim().is_empty() => PathBuf::from(path.trim()),
            _ => default_manual_output_dir(),
        };
        fs::create_dir_all(&output_dir)
            .map_err(|error| format!("Failed to create manual output directory: {error}"))?;
        Ok(output_dir)
    }

    fn escape_xml(value: &str) -> String {
        value
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&apos;")
    }

    fn render_overlay_svg(
        source_image: &OcrImagePayload,
        ocr_result: &OcrRecognitionResult,
        translated_blocks: &[ManualTranslatedBlock],
    ) -> String {
        let width = ocr_result.image_width.max(1);
        let height = ocr_result.image_height.max(1);
        let blocks = translated_blocks
            .iter()
            .map(|block| {
                let font_size = block.bbox.height.clamp(14, 32);
                let text_y = block.bbox.y + font_size + 6;
                format!(
                    "<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" rx=\"8\" fill=\"rgba(255,255,255,0.94)\" /><text x=\"{}\" y=\"{}\" font-size=\"{}\" font-family=\"'Microsoft YaHei', 'PingFang SC', sans-serif\" fill=\"#111827\">{}</text>",
                    block.bbox.x,
                    block.bbox.y,
                    block.bbox.width,
                    block.bbox.height,
                    block.bbox.x + 8,
                    text_y,
                    font_size,
                    escape_xml(&block.translated_text),
                )
            })
            .collect::<Vec<_>>()
            .join("");

        format!(
            "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{width}\" height=\"{height}\" viewBox=\"0 0 {width} {height}\"><image href=\"{}\" x=\"0\" y=\"0\" width=\"{width}\" height=\"{height}\" preserveAspectRatio=\"none\" />{blocks}</svg>",
            source_image.data_url
        )
    }

    fn write_manual_artifacts(
        output_dir: &Path,
        ocr_result: &OcrRecognitionResult,
        translated_blocks: &[ManualTranslatedBlock],
        full_text: &str,
        overlay_svg: &str,
    ) -> Result<(), String> {
        fs::write(
            output_dir.join("ocr-result.json"),
            serde_json::to_vec_pretty(ocr_result)
                .map_err(|error| format!("Failed to serialize OCR result: {error}"))?,
        )
        .map_err(|error| format!("Failed to write OCR result artifact: {error}"))?;
        fs::write(
            output_dir.join("translated-blocks.json"),
            serde_json::to_vec_pretty(translated_blocks)
                .map_err(|error| format!("Failed to serialize translated blocks: {error}"))?,
        )
        .map_err(|error| format!("Failed to write translated blocks artifact: {error}"))?;
        fs::write(output_dir.join("translated.txt"), full_text)
            .map_err(|error| format!("Failed to write translated text artifact: {error}"))?;
        fs::write(output_dir.join("translated-overlay.svg"), overlay_svg)
            .map_err(|error| format!("Failed to write overlay artifact: {error}"))?;
        Ok(())
    }

    #[test]
    fn extracts_base64_payload_from_data_url() {
        let payload = extract_image_base64("data:image/png;base64,aGVsbG8=").unwrap();
        assert_eq!(payload, "aGVsbG8=");
    }

    #[test]
    fn builds_bbox_from_polygon() {
        let bbox = build_bbox(&[[12, 14], [42, 16], [40, 38], [11, 35]]);
        assert_eq!(
            bbox,
            OcrBoundingBox {
                x: 11,
                y: 14,
                width: 31,
                height: 24,
            }
        );
    }

    #[test]
    #[ignore = "manual network e2e"]
    fn manual_rapidocr_e2e() {
        tauri::async_runtime::block_on(async {
            let temp_dir = unique_temp_dir("rapidocr-manual");
            let executable_path = install_engine_for_manual_test(OcrEngineId::Rapidocr, &temp_dir)
                .await
                .expect("rapidocr install should succeed");
            let payload = load_fixture_payload().expect("fixture should load");
            let result = recognize_with_engine(OcrEngineId::Rapidocr, &executable_path, payload)
                .expect("rapidocr should recognize");
            let joined = result
                .blocks
                .iter()
                .map(|block| block.source_text.clone())
                .collect::<Vec<_>>()
                .join(" | ");

            println!("RapidOCR blocks: {joined}");
            assert!(
                !result.blocks.is_empty(),
                "RapidOCR should return at least one block"
            );
            assert!(
                joined.to_lowercase().contains("translate")
                    || joined.to_lowercase().contains("copy"),
                "RapidOCR output should contain expected English text, got: {joined}"
            );

            let _ = fs::remove_dir_all(temp_dir);
        });
    }

    #[test]
    #[ignore = "manual network e2e"]
    fn manual_paddleocr_e2e() {
        tauri::async_runtime::block_on(async {
            let temp_dir = unique_temp_dir("paddleocr-manual");
            let executable_path = install_engine_for_manual_test(OcrEngineId::Paddleocr, &temp_dir)
                .await
                .expect("paddleocr install should succeed");
            let payload = load_fixture_payload().expect("fixture should load");
            let result = recognize_with_engine(OcrEngineId::Paddleocr, &executable_path, payload)
                .expect("paddleocr should recognize");
            let joined = result
                .blocks
                .iter()
                .map(|block| block.source_text.clone())
                .collect::<Vec<_>>()
                .join(" | ");

            println!("PaddleOCR blocks: {joined}");
            assert!(
                !result.blocks.is_empty(),
                "PaddleOCR should return at least one block"
            );
            assert!(
                joined.to_lowercase().contains("translate")
                    || joined.to_lowercase().contains("copy"),
                "PaddleOCR output should contain expected English text, got: {joined}"
            );

            let _ = fs::remove_dir_all(temp_dir);
        });
    }

    #[test]
    fn manual_ai_config_prefers_environment_variables() {
        let _guard = ScopedEnvGuard::set_many(&[
            ("AI_TRANSLATION_BASE_URL", Some("https://example.com/v1")),
            ("AI_TRANSLATION_API_KEY", Some("test-key")),
            ("AI_TRANSLATION_MODEL", Some("gpt-4o-mini")),
            ("AI_TRANSLATION_SYSTEM_PROMPT", Some("Translate accurately")),
            ("AI_TRANSLATION_APP_CONFIG_PATH", None),
        ]);

        let config = resolve_manual_ai_config().expect("env config should resolve");

        assert_eq!(config.base_url, "https://example.com/v1");
        assert_eq!(config.api_key, "test-key");
        assert_eq!(config.model, "gpt-4o-mini");
        assert_eq!(config.system_prompt, "Translate accurately");
    }

    #[test]
    fn manual_ai_config_loads_enabled_model_from_app_config_file() {
        let temp_dir = unique_temp_dir("manual-ai-config");
        fs::create_dir_all(&temp_dir).expect("temp dir should be created");
        let config_path = temp_dir.join("app-config.json");
        fs::write(
            &config_path,
            serde_json::to_vec(&serde_json::json!({
                "app-config": {
                    "models": [
                        {
                            "id": "disabled-model",
                            "name": "Disabled",
                            "provider": "openai-compatible",
                            "baseUrl": "https://disabled.example.com/v1",
                            "apiKey": "disabled-key",
                            "model": "disabled-model",
                            "enabled": false,
                            "isDefault": false,
                            "systemPrompt": "Ignore me",
                            "timeoutMs": 60000,
                            "createdAt": "2026-04-07T00:00:00.000Z",
                            "updatedAt": "2026-04-07T00:00:00.000Z"
                        },
                        {
                            "id": "selected-model",
                            "name": "Selected",
                            "provider": "openai-compatible",
                            "baseUrl": "https://enabled.example.com/v1",
                            "apiKey": "enabled-key",
                            "model": "qwen-plus",
                            "enabled": true,
                            "isDefault": true,
                            "systemPrompt": "Translate only",
                            "timeoutMs": 60000,
                            "createdAt": "2026-04-07T00:00:00.000Z",
                            "updatedAt": "2026-04-07T00:00:00.000Z"
                        }
                    ],
                    "preferences": {
                        "selectedTranslationModelId": "selected-model"
                    }
                }
            }))
            .expect("config json should serialize"),
        )
        .expect("config file should be written");

        let _guard = ScopedEnvGuard::set_many(&[
            ("AI_TRANSLATION_BASE_URL", None),
            ("AI_TRANSLATION_API_KEY", None),
            ("AI_TRANSLATION_MODEL", None),
            ("AI_TRANSLATION_SYSTEM_PROMPT", None),
            (
                "AI_TRANSLATION_APP_CONFIG_PATH",
                Some(config_path.to_string_lossy().as_ref()),
            ),
        ]);

        let config = resolve_manual_ai_config().expect("app config should resolve");

        assert_eq!(config.base_url, "https://enabled.example.com/v1");
        assert_eq!(config.api_key, "enabled-key");
        assert_eq!(config.model, "qwen-plus");
        assert_eq!(config.system_prompt, "Translate only");

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn manual_ai_translation_calls_openai_compatible_endpoint() {
        let listener =
            std::net::TcpListener::bind("127.0.0.1:0").expect("mock AI listener should bind");
        let address = listener
            .local_addr()
            .expect("mock AI listener address should resolve");
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("mock AI connection should arrive");
            stream
                .set_read_timeout(Some(std::time::Duration::from_secs(2)))
                .expect("mock AI stream timeout should be configurable");
            let mut request_bytes = Vec::new();
            let mut buffer = [0u8; 1024];
            let mut expected_total_bytes = None;

            loop {
                let bytes_read = stream
                    .read(&mut buffer)
                    .expect("mock AI request should be readable");
                if bytes_read == 0 {
                    break;
                }
                request_bytes.extend_from_slice(&buffer[..bytes_read]);

                if expected_total_bytes.is_none() {
                    let header_end = request_bytes
                        .windows(4)
                        .position(|window| window == b"\r\n\r\n")
                        .map(|index| index + 4);
                    if let Some(header_end) = header_end {
                        let headers = String::from_utf8_lossy(&request_bytes[..header_end]);
                        let content_length = headers
                            .lines()
                            .find_map(|line| {
                                line.strip_prefix("Content-Length:")
                                    .map(str::trim)
                                    .and_then(|value| value.parse::<usize>().ok())
                            })
                            .unwrap_or(0);
                        expected_total_bytes = Some(header_end + content_length);
                    }
                }

                if expected_total_bytes.is_some_and(|total| request_bytes.len() >= total) {
                    break;
                }
            }

            let request_text = String::from_utf8_lossy(&request_bytes).to_string();

            assert!(
                request_text.contains("POST /chat/completions"),
                "unexpected request: {request_text}"
            );

            let body = serde_json::json!({
                "id": "chatcmpl-test",
                "model": "mock-model",
                "choices": [
                    {
                        "message": {
                            "content": "翻译文本"
                        }
                    }
                ]
            })
            .to_string();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body,
            );

            stream
                .write_all(response.as_bytes())
                .expect("mock AI response should be writable");
            stream.flush().expect("mock AI response should flush");
        });

        let translated_text = tauri::async_runtime::block_on(translate_block_with_ai(
            &ManualAiConfig {
                base_url: format!("http://{address}"),
                api_key: "test-key".to_string(),
                model: "mock-model".to_string(),
                system_prompt: "Translate accurately".to_string(),
            },
            "Translate Text",
            "English",
            "Chinese (Simplified)",
        ))
        .expect("AI translation should succeed");

        assert_eq!(translated_text, "翻译文本");
        server.join().expect("mock AI server should stop cleanly");
    }

    #[test]
    #[ignore = "manual live OCR + AI translation e2e"]
    fn manual_live_image_translation_ai_e2e() {
        tauri::async_runtime::block_on(async {
            let ai_config = resolve_manual_ai_config().expect("AI config should resolve");
            let engine_id = resolve_manual_ocr_engine().expect("OCR engine should resolve");
            let temp_dir = unique_temp_dir("image-translation-live");
            let executable_path = install_engine_for_manual_test(engine_id, &temp_dir)
                .await
                .expect("OCR engine install should succeed");
            let payload = resolve_manual_image_payload().expect("manual payload should load");
            let output_dir = resolve_manual_output_dir().expect("manual output dir should resolve");
            let ocr_result = recognize_with_engine(engine_id, &executable_path, payload.clone())
                .expect("OCR recognition should succeed");
            let mut translated_blocks = Vec::with_capacity(ocr_result.blocks.len());

            for block in &ocr_result.blocks {
                let translated_text = translate_block_with_ai(
                    &ai_config,
                    &block.source_text,
                    "auto",
                    "Chinese (Simplified)",
                )
                .await
                .unwrap_or_else(|error| {
                    panic!(
                        "AI translation should succeed for block {}: {error}",
                        block.id
                    )
                });

                translated_blocks.push(ManualTranslatedBlock {
                    block_id: block.id.clone(),
                    source_text: block.source_text.clone(),
                    translated_text,
                    bbox: block.bbox.clone(),
                });
            }

            let full_text = translated_blocks
                .iter()
                .map(|block| block.translated_text.as_str())
                .collect::<Vec<_>>()
                .join("\n");
            let overlay_svg = render_overlay_svg(&payload, &ocr_result, &translated_blocks);

            write_manual_artifacts(
                &output_dir,
                &ocr_result,
                &translated_blocks,
                &full_text,
                &overlay_svg,
            )
            .expect("manual artifacts should be written");

            println!("Manual image translation output: {}", output_dir.display());
            println!("Translated text: {full_text}");

            assert!(
                !ocr_result.blocks.is_empty(),
                "OCR should return at least one block"
            );
            assert!(
                !full_text.trim().is_empty(),
                "AI translation should return non-empty text"
            );

            let _ = fs::remove_dir_all(temp_dir);
        });
    }
}
