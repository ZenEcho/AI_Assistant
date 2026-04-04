use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppLogRelatedEntity {
    pub r#type: String,
    pub id: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppLogRecord {
    pub id: String,
    pub timestamp: String,
    pub level: String,
    pub category: String,
    pub source: String,
    pub action: String,
    pub message: String,
    pub detail: Option<Value>,
    pub context: Option<Value>,
    pub window_label: Option<String>,
    pub request_id: Option<String>,
    pub trace_id: Option<String>,
    pub related_entity: Option<AppLogRelatedEntity>,
    pub success: Option<bool>,
    pub duration_ms: Option<u64>,
    pub error_code: Option<String>,
    pub error_stack: Option<String>,
    pub ingest_seq: Option<u64>,
    pub visibility: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppLogQuery {
    pub levels: Option<Vec<String>>,
    pub categories: Option<Vec<String>>,
    pub sources: Option<Vec<String>>,
    pub keyword: Option<String>,
    pub request_id: Option<String>,
    pub trace_id: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub limit: Option<usize>,
    pub include_debug: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppLogExportOptions {
    pub format: String,
    pub levels: Option<Vec<String>>,
    pub categories: Option<Vec<String>>,
    pub sources: Option<Vec<String>>,
    pub keyword: Option<String>,
    pub request_id: Option<String>,
    pub trace_id: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub limit: Option<usize>,
    pub include_debug: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppLogExportResult {
    pub path: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppLogRuntimeConfigPayload {
    pub retain_days: usize,
    pub max_entries: usize,
    pub max_file_size_mb: usize,
}
