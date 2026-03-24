use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{collections::HashMap, time::Duration};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProxyChatCompletionRequest {
    base_url: String,
    api_key: String,
    model: String,
    messages: Vec<ChatMessage>,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
    timeout_ms: Option<u64>,
    extra_headers: Option<HashMap<String, String>>,
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

#[tauri::command]
async fn request_openai_compatible_completion(
    payload: ProxyChatCompletionRequest,
) -> Result<ProxyChatCompletionResponse, String> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));

    if !payload.api_key.trim().is_empty() {
        let auth = format!("Bearer {}", payload.api_key.trim());
        let auth_header = HeaderValue::from_str(&auth).map_err(|error| error.to_string())?;
        headers.insert(AUTHORIZATION, auth_header);
    }

    if let Some(extra_headers) = &payload.extra_headers {
        for (key, value) in extra_headers {
            let key = key.trim();
            let value = value.trim();

            if key.is_empty() || value.is_empty() {
                continue;
            }

            let name = HeaderName::from_bytes(key.as_bytes())
                .map_err(|error| format!("Invalid header name `{key}`: {error}"))?;
            let header_value = HeaderValue::from_str(value)
                .map_err(|error| format!("Invalid header value for `{key}`: {error}"))?;
            headers.insert(name, header_value);
        }
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(payload.timeout_ms.unwrap_or(60_000)))
        .build()
        .map_err(|error| format!("Failed to create request client: {error}"))?;

    let request_url = format!(
        "{}/chat/completions",
        payload.base_url.trim_end_matches('/')
    );

    let response = client
        .post(request_url)
        .headers(headers)
        .json(&json!({
            "model": payload.model,
            "messages": payload.messages,
            "temperature": payload.temperature.unwrap_or(0.2),
            "max_tokens": payload.max_tokens.unwrap_or(1200),
            "stream": false
        }))
        .send()
        .await
        .map_err(|error| format!("Request failed: {error}"))?;

    let status = response.status();
    let raw: Value = response
        .json()
        .await
        .map_err(|error| format!("Invalid response body: {error}"))?;

    if !status.is_success() {
        let error_message = raw
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .or_else(|| raw.get("message").and_then(Value::as_str))
            .unwrap_or("Unknown provider error");

        return Err(format!("{error_message} ({status})"));
    }

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
    let content = payload.pointer("/choices/0/message/content")?;

    match content {
        Value::String(text) => Some(text.trim().to_string()),
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

            if content.trim().is_empty() {
                None
            } else {
                Some(content.trim().to_string())
            }
        }
        _ => None,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            request_openai_compatible_completion
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
