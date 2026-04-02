use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{Emitter, Manager};

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

fn build_headers(payload: &ProxyChatCompletionRequest) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));

    if !payload.api_key.trim().is_empty() {
        let auth = format!("Bearer {}", payload.api_key.trim());
        let auth_header = HeaderValue::from_str(&auth).map_err(|error| error.to_string())?;
        headers.insert(AUTHORIZATION, auth_header);
    }

    Ok(headers)
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
    let headers = build_headers(payload)?;

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
    payload: ProxyChatCompletionRequest,
) -> Result<ProxyChatCompletionResponse, String> {
    let response = send_openai_compatible_request(&payload, false).await?;

    if !response.status().is_success() {
        return Err(parse_provider_error(response).await);
    }

    let raw: Value = response
        .json()
        .await
        .map_err(|error| format!("Invalid response body: {error}"))?;

    let content = extract_message_content(&raw)
        .ok_or_else(|| "Provider returned no message content.".to_string())?;

    Ok(ProxyChatCompletionResponse {
        id: raw.get("id").and_then(Value::as_str).map(str::to_owned),
        model: raw.get("model").and_then(Value::as_str).map(str::to_owned),
        content,
        usage: raw.get("usage").map(parse_usage),
        raw,
    })
}

#[tauri::command]
async fn request_openai_compatible_completion_stream(
    window: tauri::Window,
    payload: ProxyChatCompletionRequest,
    request_id: String,
) -> Result<ProxyChatCompletionResponse, String> {
    let mut response = send_openai_compatible_request(&payload, true).await?;

    if !response.status().is_success() {
        return Err(parse_provider_error(response).await);
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
        return Err("Provider returned no streamed message content.".to_string());
    }

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
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init());

    builder
        .invoke_handler(tauri::generate_handler![
            request_openai_compatible_completion,
            request_openai_compatible_completion_stream,
            exit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
