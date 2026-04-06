mod commands;
mod logging;
mod system_input;

use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, CONTENT_TYPE, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use sys_locale::get_locale;
use logging::{append_backend_log, storage::AppLogState, types::AppLogRecord};
use system_input::state::SystemInputState;
use tauri::{Emitter, Manager};
#[cfg(desktop)]
use tauri_plugin_autostart::MacosLauncher;

const GITHUB_LATEST_RELEASE_API_URL: &str =
    "https://api.github.com/repos/ZenEcho/AI_Translation/releases/latest";
const GITHUB_API_USER_AGENT: &str = "AI-Translation-Desktop";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ResetAppRuntimeAction {
    Exit,
    Restart,
}

impl ResetAppRuntimeAction {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "exit" => Ok(Self::Exit),
            "restart" => Ok(Self::Restart),
            other => Err(format!("Unsupported reset app runtime action: {other}")),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatMessage {
    role: String,
    content: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProxyChatCompletionRequest {
    base_url: String,
    api_key: String,
    model: String,
    messages: Vec<ChatMessage>,
    timeout_ms: Option<u64>,
    request_id: Option<String>,
    trace_id: Option<String>,
    detailed_logging: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TokenUsage {
    prompt_tokens: Option<u32>,
    completion_tokens: Option<u32>,
    total_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProxyChatCompletionResponse {
    id: Option<String>,
    model: Option<String>,
    content: String,
    usage: Option<TokenUsage>,
    raw: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamDeltaPayload {
    request_id: String,
    delta: String,
}

#[derive(Debug, Clone, Deserialize)]
struct GitHubLatestReleaseResponse {
    tag_name: String,
    name: Option<String>,
    html_url: String,
    published_at: Option<String>,
    draft: bool,
    prerelease: bool,
    body: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitHubLatestReleasePayload {
    tag_name: String,
    version: String,
    name: Option<String>,
    html_url: String,
    published_at: Option<String>,
    draft: bool,
    prerelease: bool,
    body: Option<String>,
}

fn build_headers(payload: &ProxyChatCompletionRequest, stream: bool) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        ACCEPT,
        if stream {
            HeaderValue::from_static("text/event-stream")
        } else {
            HeaderValue::from_static("application/json")
        },
    );

    if !payload.api_key.trim().is_empty() {
        let auth = format!("Bearer {}", payload.api_key.trim());
        let auth_header = HeaderValue::from_str(&auth).map_err(|error| error.to_string())?;
        headers.insert(AUTHORIZATION, auth_header);
    }

    Ok(headers)
}

fn normalize_version(version: &str) -> String {
    version
        .trim()
        .trim_start_matches(|character| character == 'v' || character == 'V')
        .to_string()
}

fn build_request_body(payload: &ProxyChatCompletionRequest, stream: bool) -> Value {
    json!({
        "model": payload.model,
        "messages": payload.messages,
        "stream": stream
    })
}

async fn send_openai_compatible_request(
    payload: &ProxyChatCompletionRequest,
    stream: bool,
) -> Result<reqwest::Response, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(payload.timeout_ms.unwrap_or(60_000)))
        .build()
        .map_err(|error| format!("Failed to create request client: {error}"))?;

    let request_url = format!(
        "{}/chat/completions",
        payload.base_url.trim_end_matches('/')
    );
    let headers = build_headers(payload, stream)?;

    client
        .post(request_url)
        .headers(headers)
        .json(&build_request_body(payload, stream))
        .send()
        .await
        .map_err(|error| format!("Request failed: {error}"))
}

fn extract_provider_error_message(raw: &Value) -> Option<String> {
    raw.get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .or_else(|| raw.get("message").and_then(Value::as_str))
        .map(str::to_owned)
}

async fn parse_provider_error(response: reqwest::Response) -> String {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    if let Ok(raw) = serde_json::from_str::<Value>(&body) {
        let error_message =
            extract_provider_error_message(&raw).unwrap_or_else(|| "Unknown provider error".into());
        return format!("{error_message} ({status})");
    }

    if body.trim().is_empty() {
        format!("Unknown provider error ({status})")
    } else {
        format!("{} ({status})", body.trim())
    }
}

fn extract_text_content(value: &Value) -> Option<String> {
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

fn take_next_sse_event(buffer: &mut String) -> Option<String> {
    if let Some(index) = buffer.find("\r\n\r\n") {
        let event = buffer[..index].to_string();
        buffer.drain(..index + 4);
        return Some(event);
    }

    if let Some(index) = buffer.find("\n\n") {
        let event = buffer[..index].to_string();
        buffer.drain(..index + 2);
        return Some(event);
    }

    None
}

fn extract_sse_data(event_block: &str) -> Option<String> {
    let data = event_block
        .lines()
        .filter_map(|line| line.strip_prefix("data:").map(str::trim_start))
        .collect::<Vec<_>>()
        .join("\n");

    if data.is_empty() {
        None
    } else {
        Some(data)
    }
}

fn extract_delta_content(payload: &Value) -> Option<String> {
    payload
        .pointer("/choices/0/delta/content")
        .and_then(extract_text_content)
        .filter(|content| !content.is_empty())
}

fn process_stream_event(
    event_block: &str,
    window: &tauri::Window,
    request_id: &str,
    response_id: &mut Option<String>,
    model: &mut Option<String>,
    usage: &mut Option<TokenUsage>,
    content: &mut String,
    raw_chunks: &mut Vec<Value>,
) -> Result<(), String> {
    let Some(data) = extract_sse_data(event_block) else {
        return Ok(());
    };

    if data == "[DONE]" {
        return Ok(());
    }

    let raw_chunk: Value = serde_json::from_str(&data)
        .map_err(|error| format!("Invalid stream response payload: {error}"))?;

    if let Some(error_message) = extract_provider_error_message(&raw_chunk) {
        return Err(error_message);
    }

    if response_id.is_none() {
        *response_id = raw_chunk
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_owned);
    }

    if model.is_none() {
        *model = raw_chunk
            .get("model")
            .and_then(Value::as_str)
            .map(str::to_owned);
    }

    if usage.is_none() {
        *usage = raw_chunk.get("usage").map(parse_usage);
    }

    if let Some(delta) = extract_delta_content(&raw_chunk) {
        content.push_str(&delta);
        let _ = window.emit(
            "openai-compatible-stream",
            StreamDeltaPayload {
                request_id: request_id.to_string(),
                delta,
            },
        );
    }

    raw_chunks.push(raw_chunk);
    Ok(())
}

#[tauri::command]
async fn request_openai_compatible_completion(
    app: tauri::AppHandle,
    log_state: tauri::State<'_, AppLogState>,
    payload: ProxyChatCompletionRequest,
) -> Result<ProxyChatCompletionResponse, String> {
    let request_id = payload.request_id.clone();
    let trace_id = payload.trace_id.clone();
    let _ = append_backend_log(
        &app,
        &log_state,
        AppLogRecord {
            id: String::new(),
            timestamp: String::new(),
            level: "info".into(),
            category: "network".into(),
            source: "rust".into(),
            action: "provider.request.non-stream.start".into(),
            message: "开始执行非流式 Provider 请求".into(),
            detail: Some(json!({
                "baseUrl": payload.base_url,
                "model": payload.model,
                "timeoutMs": payload.timeout_ms,
                "messageCount": payload.messages.len(),
                "detailedLogging": payload.detailed_logging,
            })),
            context: None,
            window_label: None,
            request_id: request_id.clone(),
            trace_id: trace_id.clone(),
            related_entity: None,
            success: None,
            duration_ms: None,
            error_code: None,
            error_stack: None,
            ingest_seq: None,
            visibility: Some("debug".into()),
        },
    );
    let response = match send_openai_compatible_request(&payload, false).await {
        Ok(response) => response,
        Err(error) => {
            let _ = append_backend_log(
                &app,
                &log_state,
                AppLogRecord {
                    id: String::new(),
                    timestamp: String::new(),
                    level: "error".into(),
                    category: "network".into(),
                    source: "rust".into(),
                    action: "provider.request.non-stream.failed".into(),
                    message: "非流式 Provider 请求发送失败".into(),
                    detail: None,
                    context: None,
                    window_label: None,
                    request_id: request_id.clone(),
                    trace_id: trace_id.clone(),
                    related_entity: None,
                    success: Some(false),
                    duration_ms: None,
                    error_code: None,
                    error_stack: Some(error.clone()),
                    ingest_seq: None,
                    visibility: Some("user".into()),
                },
            );
            return Err(error);
        }
    };

    if !response.status().is_success() {
        let error = parse_provider_error(response).await;
        let _ = append_backend_log(
            &app,
            &log_state,
            AppLogRecord {
                id: String::new(),
                timestamp: String::new(),
                level: "error".into(),
                category: "network".into(),
                source: "rust".into(),
                action: "provider.response.non-stream.failed".into(),
                message: "非流式 Provider 响应失败".into(),
                detail: None,
                context: None,
                window_label: None,
                request_id: request_id.clone(),
                trace_id: trace_id.clone(),
                related_entity: None,
                success: Some(false),
                duration_ms: None,
                error_code: None,
                error_stack: Some(error.clone()),
                ingest_seq: None,
                visibility: Some("user".into()),
            },
        );
        return Err(error);
    }

    let raw: Value = response
        .json()
        .await
        .map_err(|error| format!("Invalid response body: {error}"))?;

    let content = extract_message_content(&raw)
        .ok_or_else(|| "Provider returned no message content.".to_string())?;

    let _ = append_backend_log(
        &app,
        &log_state,
        AppLogRecord {
            id: String::new(),
            timestamp: String::new(),
            level: "info".into(),
            category: "network".into(),
            source: "rust".into(),
            action: "provider.response.non-stream.success".into(),
            message: "非流式 Provider 响应成功".into(),
            detail: Some(json!({
                "responseId": raw.get("id").and_then(Value::as_str),
                "model": raw.get("model").and_then(Value::as_str),
                "hasUsage": raw.get("usage").is_some(),
            })),
            context: None,
            window_label: None,
            request_id: request_id,
            trace_id,
            related_entity: None,
            success: Some(true),
            duration_ms: None,
            error_code: None,
            error_stack: None,
            ingest_seq: None,
            visibility: Some("user".into()),
        },
    );

    Ok(ProxyChatCompletionResponse {
        id: raw.get("id").and_then(Value::as_str).map(str::to_owned),
        model: raw.get("model").and_then(Value::as_str).map(str::to_owned),
        content,
        usage: raw.get("usage").map(parse_usage),
        raw,
    })
}

#[tauri::command]
async fn fetch_latest_github_release(
    app: tauri::AppHandle,
    log_state: tauri::State<'_, AppLogState>,
) -> Result<GitHubLatestReleasePayload, String> {
    let _ = append_backend_log(
        &app,
        &log_state,
        AppLogRecord {
            id: String::new(),
            timestamp: String::new(),
            level: "debug".into(),
            category: "app".into(),
            source: "rust".into(),
            action: "app.update.github.start".into(),
            message: "开始检查 GitHub 最新版本".into(),
            detail: None,
            context: None,
            window_label: None,
            request_id: None,
            trace_id: None,
            related_entity: None,
            success: None,
            duration_ms: None,
            error_code: None,
            error_stack: None,
            ingest_seq: None,
            visibility: Some("debug".into()),
        },
    );
    let mut headers = HeaderMap::new();
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("application/vnd.github+json"),
    );
    headers.insert(USER_AGENT, HeaderValue::from_static(GITHUB_API_USER_AGENT));

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|error| format!("Failed to create GitHub request client: {error}"))?;

    let response = match client
        .get(GITHUB_LATEST_RELEASE_API_URL)
        .headers(headers)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            let error_message = format!("Failed to request latest GitHub release: {error}");
            let _ = append_backend_log(
                &app,
                &log_state,
                AppLogRecord {
                    id: String::new(),
                    timestamp: String::new(),
                    level: "error".into(),
                    category: "app".into(),
                    source: "rust".into(),
                    action: "app.update.github.request.failed".into(),
                    message: "请求 GitHub 最新版本失败".into(),
                    detail: None,
                    context: None,
                    window_label: None,
                    request_id: None,
                    trace_id: None,
                    related_entity: None,
                    success: Some(false),
                    duration_ms: None,
                    error_code: None,
                    error_stack: Some(error_message.clone()),
                    ingest_seq: None,
                    visibility: Some("user".into()),
                },
            );
            return Err(error_message);
        }
    };

    if !response.status().is_success() {
        let error = parse_provider_error(response).await;
        let _ = append_backend_log(
            &app,
            &log_state,
            AppLogRecord {
                id: String::new(),
                timestamp: String::new(),
                level: "error".into(),
                category: "app".into(),
                source: "rust".into(),
                action: "app.update.github.response.failed".into(),
                message: "GitHub 最新版本响应失败".into(),
                detail: None,
                context: None,
                window_label: None,
                request_id: None,
                trace_id: None,
                related_entity: None,
                success: Some(false),
                duration_ms: None,
                error_code: None,
                error_stack: Some(error.clone()),
                ingest_seq: None,
                visibility: Some("user".into()),
            },
        );
        return Err(error);
    }

    let raw: GitHubLatestReleaseResponse = response
        .json()
        .await
        .map_err(|error| format!("Invalid GitHub release response: {error}"))?;

    let payload = GitHubLatestReleasePayload {
        version: normalize_version(&raw.tag_name),
        tag_name: raw.tag_name,
        name: raw.name,
        html_url: raw.html_url,
        published_at: raw.published_at,
        draft: raw.draft,
        prerelease: raw.prerelease,
        body: raw.body,
    };

    let _ = append_backend_log(
        &app,
        &log_state,
        AppLogRecord {
            id: String::new(),
            timestamp: String::new(),
            level: "info".into(),
            category: "app".into(),
            source: "rust".into(),
            action: "app.update.github.success".into(),
            message: "已获取 GitHub 最新版本信息".into(),
            detail: Some(json!({
                "version": payload.version,
                "tagName": payload.tag_name,
                "prerelease": payload.prerelease,
            })),
            context: None,
            window_label: None,
            request_id: None,
            trace_id: None,
            related_entity: None,
            success: Some(true),
            duration_ms: None,
            error_code: None,
            error_stack: None,
            ingest_seq: None,
            visibility: Some("user".into()),
        },
    );

    Ok(payload)
}

#[tauri::command]
async fn request_openai_compatible_completion_stream(
    app: tauri::AppHandle,
    log_state: tauri::State<'_, AppLogState>,
    window: tauri::Window,
    payload: ProxyChatCompletionRequest,
    request_id: String,
) -> Result<ProxyChatCompletionResponse, String> {
    let trace_id = payload.trace_id.clone();
    let _ = append_backend_log(
        &app,
        &log_state,
        AppLogRecord {
            id: String::new(),
            timestamp: String::new(),
            level: "info".into(),
            category: "network".into(),
            source: "rust".into(),
            action: "provider.request.stream.start".into(),
            message: "开始执行流式 Provider 请求".into(),
            detail: Some(json!({
                "baseUrl": payload.base_url,
                "model": payload.model,
                "timeoutMs": payload.timeout_ms,
                "messageCount": payload.messages.len(),
                "detailedLogging": payload.detailed_logging,
            })),
            context: None,
            window_label: None,
            request_id: Some(request_id.clone()),
            trace_id: trace_id.clone(),
            related_entity: None,
            success: None,
            duration_ms: None,
            error_code: None,
            error_stack: None,
            ingest_seq: None,
            visibility: Some("debug".into()),
        },
    );
    let mut response = match send_openai_compatible_request(&payload, true).await {
        Ok(response) => response,
        Err(error) => {
            let _ = append_backend_log(
                &app,
                &log_state,
                AppLogRecord {
                    id: String::new(),
                    timestamp: String::new(),
                    level: "error".into(),
                    category: "network".into(),
                    source: "rust".into(),
                    action: "provider.request.stream.failed".into(),
                    message: "流式 Provider 请求发送失败".into(),
                    detail: None,
                    context: None,
                    window_label: None,
                    request_id: Some(request_id.clone()),
                    trace_id: trace_id.clone(),
                    related_entity: None,
                    success: Some(false),
                    duration_ms: None,
                    error_code: None,
                    error_stack: Some(error.clone()),
                    ingest_seq: None,
                    visibility: Some("user".into()),
                },
            );
            return Err(error);
        }
    };

    if !response.status().is_success() {
        let error = parse_provider_error(response).await;
        let _ = append_backend_log(
            &app,
            &log_state,
            AppLogRecord {
                id: String::new(),
                timestamp: String::new(),
                level: "error".into(),
                category: "network".into(),
                source: "rust".into(),
                action: "provider.response.stream.failed".into(),
                message: "流式 Provider 响应失败".into(),
                detail: None,
                context: None,
                window_label: None,
                request_id: Some(request_id.clone()),
                trace_id: trace_id.clone(),
                related_entity: None,
                success: Some(false),
                duration_ms: None,
                error_code: None,
                error_stack: Some(error.clone()),
                ingest_seq: None,
                visibility: Some("user".into()),
            },
        );
        return Err(error);
    }

    let mut response_id = None;
    let mut model = None;
    let mut usage = None;
    let mut content = String::new();
    let mut raw_chunks = Vec::new();
    let mut stream_buffer = String::new();

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("Failed to read stream chunk: {error}"))?
    {
        stream_buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(event_block) = take_next_sse_event(&mut stream_buffer) {
            process_stream_event(
                &event_block,
                &window,
                &request_id,
                &mut response_id,
                &mut model,
                &mut usage,
                &mut content,
                &mut raw_chunks,
            )?;
        }
    }

    if !stream_buffer.trim().is_empty() {
        stream_buffer.push_str("\n\n");

        while let Some(event_block) = take_next_sse_event(&mut stream_buffer) {
            process_stream_event(
                &event_block,
                &window,
                &request_id,
                &mut response_id,
                &mut model,
                &mut usage,
                &mut content,
                &mut raw_chunks,
            )?;
        }
    }

    let final_content = content.trim().to_string();

    if final_content.is_empty() {
        let error = "Provider returned no streamed message content.".to_string();
        let _ = append_backend_log(
            &app,
            &log_state,
            AppLogRecord {
                id: String::new(),
                timestamp: String::new(),
                level: "error".into(),
                category: "network".into(),
                source: "rust".into(),
                action: "provider.response.stream-empty".into(),
                message: "流式 Provider 响应未返回有效内容".into(),
                detail: None,
                context: None,
                window_label: None,
                request_id: Some(request_id.clone()),
                trace_id: trace_id.clone(),
                related_entity: None,
                success: Some(false),
                duration_ms: None,
                error_code: None,
                error_stack: Some(error.clone()),
                ingest_seq: None,
                visibility: Some("user".into()),
            },
        );
        return Err("Provider returned no streamed message content.".to_string());
    }

    let _ = append_backend_log(
        &app,
        &log_state,
        AppLogRecord {
            id: String::new(),
            timestamp: String::new(),
            level: "info".into(),
            category: "network".into(),
            source: "rust".into(),
            action: "provider.response.stream.success".into(),
            message: "流式 Provider 响应成功".into(),
            detail: Some(json!({
                "responseId": response_id.clone(),
                "model": model.clone(),
                "hasUsage": usage.is_some(),
                "chunkCount": raw_chunks.len(),
            })),
            context: None,
            window_label: None,
            request_id: Some(request_id.clone()),
            trace_id: trace_id.clone(),
            related_entity: None,
            success: Some(true),
            duration_ms: None,
            error_code: None,
            error_stack: None,
            ingest_seq: None,
            visibility: Some("user".into()),
        },
    );

    Ok(ProxyChatCompletionResponse {
        id: response_id,
        model,
        content: final_content,
        usage,
        raw: json!({
            "stream": true,
            "chunks": raw_chunks,
        }),
    })
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn reset_app_runtime(app: tauri::AppHandle, action: String) -> Result<(), String> {
    logging::app_log_clear(app.clone())?;

    match ResetAppRuntimeAction::parse(&action)? {
        ResetAppRuntimeAction::Exit => {
            app.exit(0);
            Ok(())
        }
        ResetAppRuntimeAction::Restart => app.restart(),
    }
}

#[tauri::command]
fn app_get_system_locale() -> String {
    get_locale().unwrap_or_else(|| "en-US".to_string())
}

fn parse_usage(value: &Value) -> TokenUsage {
    TokenUsage {
        prompt_tokens: value
            .get("prompt_tokens")
            .and_then(Value::as_u64)
            .map(|value| value as u32),
        completion_tokens: value
            .get("completion_tokens")
            .and_then(Value::as_u64)
            .map(|value| value as u32),
        total_tokens: value
            .get("total_tokens")
            .and_then(Value::as_u64)
            .map(|value| value as u32),
    }
}

fn extract_message_content(payload: &Value) -> Option<String> {
    payload
        .pointer("/choices/0/message/content")
        .and_then(extract_text_content)
        .map(|content| content.trim().to_string())
        .filter(|content| !content.is_empty())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(AppLogState::default())
        .manage(SystemInputState::default())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_autostart::init(
                MacosLauncher::LaunchAgent,
                None,
            ))?;

            let _ = append_backend_log(
                &app.handle().clone(),
                app.state::<AppLogState>().inner(),
                AppLogRecord {
                    id: String::new(),
                    timestamp: String::new(),
                    level: "info".into(),
                    category: "app".into(),
                    source: "rust".into(),
                    action: "app.setup".into(),
                    message: "Rust 后端初始化完成".into(),
                    detail: None,
                    context: None,
                    window_label: None,
                    request_id: None,
                    trace_id: None,
                    related_entity: None,
                    success: Some(true),
                    duration_ms: None,
                    error_code: None,
                    error_stack: None,
                    ingest_seq: None,
                    visibility: Some("user".into()),
                },
            );

            Ok(())
        })
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init());

    builder
        .invoke_handler(tauri::generate_handler![
            request_openai_compatible_completion,
            request_openai_compatible_completion_stream,
            fetch_latest_github_release,
            app_get_system_locale,
            exit_app,
            reset_app_runtime,
            logging::app_log_append,
            logging::app_log_query,
            logging::app_log_clear,
            logging::app_log_export,
            logging::app_log_update_config,
            commands::system_input::system_input_init,
            commands::system_input::system_input_update_config,
            commands::system_input::system_input_get_status,
            commands::system_input::system_input_capture_selected_text,
            commands::system_input::system_input_read_clipboard_text,
            commands::system_input::system_input_paste_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::ResetAppRuntimeAction;

    #[test]
    fn parses_supported_reset_runtime_actions() {
        assert_eq!(
            ResetAppRuntimeAction::parse("exit").unwrap(),
            ResetAppRuntimeAction::Exit
        );
        assert_eq!(
            ResetAppRuntimeAction::parse("restart").unwrap(),
            ResetAppRuntimeAction::Restart
        );
    }

    #[test]
    fn rejects_unknown_reset_runtime_actions() {
        assert!(ResetAppRuntimeAction::parse("reload").is_err());
    }
}
