use std::{
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, BufWriter, Write},
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};

use chrono::{DateTime, Local, NaiveDate, Utc};
use tauri::{AppHandle, Manager};

use super::types::{AppLogExportOptions, AppLogExportResult, AppLogQuery, AppLogRecord};

const LOG_DIR_NAME: &str = "logs";
const EXPORT_DIR_NAME: &str = "exports";
const DEFAULT_LIMIT: usize = 500;
const MAX_EXPORT_LIMIT: usize = 5_000;
const RETAIN_DAYS: i64 = 7;
const MAX_TOTAL_BYTES: u64 = 20 * 1024 * 1024;
const MAX_TOTAL_ENTRIES: usize = 20_000;

#[derive(Debug, Clone)]
pub struct AppLogRuntimeConfig {
    pub retain_days: i64,
    pub max_entries: usize,
    pub max_total_bytes: u64,
}

impl Default for AppLogRuntimeConfig {
    fn default() -> Self {
        Self {
            retain_days: RETAIN_DAYS,
            max_entries: MAX_TOTAL_ENTRIES,
            max_total_bytes: MAX_TOTAL_BYTES,
        }
    }
}

pub struct AppLogState {
    sequence: AtomicU64,
    config: Mutex<AppLogRuntimeConfig>,
}

impl Default for AppLogState {
    fn default() -> Self {
        Self {
            sequence: AtomicU64::new(0),
            config: Mutex::new(AppLogRuntimeConfig::default()),
        }
    }
}

impl AppLogState {
    pub fn next_seq(&self) -> u64 {
        self.sequence.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub fn config(&self) -> Result<AppLogRuntimeConfig, String> {
        self.config
            .lock()
            .map(|config| config.clone())
            .map_err(|_| "Failed to lock app log config".to_string())
    }

    pub fn update_config(&self, config: AppLogRuntimeConfig) -> Result<(), String> {
        let mut guard = self
            .config
            .lock()
            .map_err(|_| "Failed to lock app log config".to_string())?;
        *guard = config;
        Ok(())
    }
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data dir: {error}"))
}

fn ensure_dir(path: &PathBuf) -> Result<(), String> {
    fs::create_dir_all(path)
        .map_err(|error| format!("Failed to create dir {}: {error}", path.display()))
}

fn logs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app_data_dir(app)?;
    path.push(LOG_DIR_NAME);
    ensure_dir(&path)?;
    Ok(path)
}

fn exports_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app_data_dir(app)?;
    path.push(EXPORT_DIR_NAME);
    ensure_dir(&path)?;
    Ok(path)
}

fn parse_timestamp(timestamp: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(timestamp)
        .ok()
        .map(|value| value.with_timezone(&Utc))
}

fn resolve_day_key(timestamp: &str) -> String {
    parse_timestamp(timestamp)
        .map(|value| value.with_timezone(&Local).format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string())
}

fn log_file_path(app: &AppHandle, timestamp: &str) -> Result<PathBuf, String> {
    let mut path = logs_dir(app)?;
    path.push(format!("{}.ndjson", resolve_day_key(timestamp)));
    Ok(path)
}

fn list_log_files(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let mut files = fs::read_dir(logs_dir(app)?)
        .map_err(|error| format!("Failed to read logs dir: {error}"))?
        .filter_map(|entry| entry.ok().map(|item| item.path()))
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("ndjson"))
        .collect::<Vec<_>>();

    files.sort();
    files.reverse();
    Ok(files)
}

fn matches_query(record: &AppLogRecord, query: &AppLogQuery) -> bool {
    let contains = |values: &Option<Vec<String>>, current: &str| {
        values
            .as_ref()
            .map(|entries| entries.is_empty() || entries.iter().any(|entry| entry == current))
            .unwrap_or(true)
    };

    if !contains(&query.levels, &record.level)
        || !contains(&query.categories, &record.category)
        || !contains(&query.tags, &record.tag)
    {
        return false;
    }

    if let Some(keyword) = query.keyword.as_ref().map(|value| value.to_lowercase()) {
        let haystack = format!(
            "{} {} {} {} {} {}",
            record.message, record.level, record.category, record.tag, record.source, record.action,
        )
        .to_lowercase();

        if !haystack.contains(&keyword) {
            return false;
        }
    }

    true
}

fn normalize_read_record(mut record: AppLogRecord) -> AppLogRecord {
    if !matches!(record.level.as_str(), "info" | "warn" | "error") {
        record.level = "error".to_string();
    }

    if !matches!(record.category.as_str(), "frontend" | "desktop" | "backend") {
        record.category = match record.source.as_str() {
            "tauri" | "window-manager" | "system-input" => "desktop".to_string(),
            "rust" => "backend".to_string(),
            _ => "frontend".to_string(),
        };
    }

    if record.tag.trim().is_empty() {
        record.tag = if !record.source.trim().is_empty() {
            record.source.clone()
        } else if !record.action.trim().is_empty() {
            record.action.clone()
        } else {
            record.category.clone()
        };
    }

    if record.stack.is_none() {
        record.stack = record.error_stack.clone();
    }

    record
}

pub fn append_log(app: &AppHandle, record: &AppLogRecord) -> Result<(), String> {
    let path = log_file_path(app, &record.timestamp)?;
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| format!("Failed to open log file {}: {error}", path.display()))?;

    let mut writer = BufWriter::new(file);
    let line = serde_json::to_string(record)
        .map_err(|error| format!("Failed to serialize log record: {error}"))?;
    writer
        .write_all(format!("{line}\n").as_bytes())
        .map_err(|error| format!("Failed to write log file {}: {error}", path.display()))?;
    writer
        .flush()
        .map_err(|error| format!("Failed to flush log file {}: {error}", path.display()))?;

    Ok(())
}

pub fn query_logs(app: &AppHandle, query: &AppLogQuery) -> Result<Vec<AppLogRecord>, String> {
    let limit = query.limit.unwrap_or(DEFAULT_LIMIT).min(MAX_EXPORT_LIMIT);
    let mut records = Vec::new();

    for file in list_log_files(app)? {
        let handle = File::open(&file)
            .map_err(|error| format!("Failed to open log file {}: {error}", file.display()))?;
        let reader = BufReader::new(handle);
        let mut file_records = reader
            .lines()
            .map_while(Result::ok)
            .filter_map(|line| serde_json::from_str::<AppLogRecord>(&line).ok())
            .map(normalize_read_record)
            .filter(|record| matches_query(record, query))
            .collect::<Vec<_>>();

        file_records.reverse();

        for record in file_records {
            records.push(record);
            if records.len() >= limit {
                return Ok(records);
            }
        }
    }

    Ok(records)
}

pub fn clear_logs(app: &AppHandle) -> Result<(), String> {
    for file in list_log_files(app)? {
        fs::remove_file(&file)
            .map_err(|error| format!("Failed to remove log file {}: {error}", file.display()))?;
    }

    Ok(())
}

pub fn export_logs(
    app: &AppHandle,
    options: &AppLogExportOptions,
) -> Result<AppLogExportResult, String> {
    let records = query_logs(
        app,
        &AppLogQuery {
            levels: options.levels.clone(),
            categories: options.categories.clone(),
            tags: options.tags.clone(),
            keyword: options.keyword.clone(),
            limit: Some(
                options
                    .limit
                    .unwrap_or(MAX_EXPORT_LIMIT)
                    .min(MAX_EXPORT_LIMIT),
            ),
        },
    )?;
    let now = Local::now().format("%Y%m%d-%H%M%S").to_string();
    let extension = if options.format.eq_ignore_ascii_case("txt") {
        "txt"
    } else {
        "json"
    };
    let mut export_path = exports_dir(app)?;
    export_path.push(format!("logs-export-{now}.{extension}"));

    let content = if extension == "txt" {
        records
            .iter()
            .map(|record| {
                format!(
                    "[{}] [{}] [{}] [{}] {}",
                    record.timestamp, record.level, record.category, record.tag, record.message,
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        serde_json::to_string_pretty(&records)
            .map_err(|error| format!("Failed to serialize export payload: {error}"))?
    };

    fs::write(&export_path, content).map_err(|error| {
        format!(
            "Failed to write export file {}: {error}",
            export_path.display()
        )
    })?;

    Ok(AppLogExportResult {
        path: export_path.display().to_string(),
        count: records.len(),
    })
}

fn count_file_entries(path: &PathBuf) -> usize {
    File::open(path)
        .ok()
        .map(|file| BufReader::new(file).lines().map_while(Result::ok).count())
        .unwrap_or(0)
}

pub fn cleanup_logs(app: &AppHandle, config: &AppLogRuntimeConfig) -> Result<(), String> {
    let today = Local::now().date_naive();
    let files = list_log_files(app)?;

    for file in &files {
        let Some(file_stem) = file.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };

        let Ok(log_date) = NaiveDate::parse_from_str(file_stem, "%Y-%m-%d") else {
            continue;
        };

        if today.signed_duration_since(log_date).num_days() > config.retain_days {
            let _ = fs::remove_file(file);
        }
    }

    let mut sized_files = list_log_files(app)?
        .into_iter()
        .filter_map(|path| {
            fs::metadata(&path)
                .ok()
                .map(|metadata| (path, metadata.len()))
        })
        .collect::<Vec<_>>();

    let mut total_size = sized_files.iter().map(|(_, size)| *size).sum::<u64>();
    sized_files.sort_by(|left, right| left.0.cmp(&right.0));

    for (path, size) in &sized_files {
        if total_size <= config.max_total_bytes {
            break;
        }

        let _ = fs::remove_file(path);
        total_size = total_size.saturating_sub(*size);
    }

    let mut entry_files = list_log_files(app)?;
    entry_files.sort();
    let mut total_entries = entry_files.iter().map(count_file_entries).sum::<usize>();

    for path in entry_files {
        if total_entries <= config.max_entries {
            break;
        }

        let count = count_file_entries(&path);
        let _ = fs::remove_file(&path);
        total_entries = total_entries.saturating_sub(count);
    }

    Ok(())
}
