# 日志重构设计

## 目标

把现有日志系统重构为仅保留错误日志，并统一分为三大类：

- `frontend`：前端 WebView 内部错误
- `desktop`：Tauri 桌面壳、窗口、托盘、插件、命令调用失败
- `backend`：Rust 后端逻辑与原生命令错误

每条日志额外保留一个 `tag`，用于表达来源或模块，例如 `vue-runtime`、`window-manager`、`tauri-command`、`system-input`、`provider.request.failed`。

## 记录结构

前后端统一使用以下核心字段：

- `id`
- `timestamp`
- `category`
- `tag`
- `message`
- `detail`
- `stack`
- `ingestSeq`

为了降低改动面，底层类型保留部分旧字段作为兼容字段，但页面、查询和导出只面向以上核心字段。

## 采集范围

### frontend

- Vue `app.config.errorHandler`
- `window.error`
- `window.unhandledrejection`
- `console.error`（如果开启）

### desktop

- 前端通过 Tauri `invoke`、窗口 API、事件 API、桌面能力 API 失败
- 现有前端调用点中属于桌面壳职责的错误统一归入 `desktop`

### backend

- Rust 侧直接写入的错误日志
- Rust 命令执行失败
- 现有 Rust 成功/调试日志不再作为日志中心主路径

## 兼容策略

- 前端 `logger.info/debug/trace` 改为 no-op
- 前端 `logger.warn/error/fatal` 统一按错误日志写入
- Rust 侧保留现有 `append_backend_log` 调用方式，但在落盘前归一化为新结构
- 历史日志文件不迁移；查询时按当前结构读取，缺失字段时做默认处理

## 页面调整

日志中心只保留：

- 大类筛选：前端 / 桌面 / 后端
- 关键词搜索
- 刷新 / 导出 / 清空
- 列表列：时间 / 分类 / 标签 / 消息
- 详情抽屉：标签 / 消息 / detail / stack

移除：

- level/category/source/requestId/traceId/time range 等旧筛选
- verbose / minLevel 等旧日志开关

## 配置调整

保留：

- `enabled`
- `retainDays`
- `maxEntries`
- `maxFileSizeMb`
- `captureFrontendErrors`
- `captureConsoleErrors`
- `detailedRequestLogging`

删除：

- `minLevel`
- `persistMinLevel`
- `enableVerboseDebug`

## 验证

- 前端单测覆盖 logger 与 log center store 的新行为
- `vue-tsc --noEmit`
- `vitest run` 运行日志相关测试
- `cargo test --manifest-path src-tauri/Cargo.toml`
