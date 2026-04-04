# 应用内日志中心

这份文档说明当前日志系统是怎么工作的、已经覆盖了哪些链路，以及后续新增日志时应该遵守什么约定。

## 1. 设计目标

当前日志系统不是简单把 `console.log` 存起来，而是为下面这些场景服务：

- 快速定位翻译失败、缓存失效、Provider 异常
- 排查系统输入增强在外部应用中的触发、捕获、回写问题
- 追踪窗口打开、隐藏、聚焦、事件分发
- 让前端错误与 Rust 原生错误落在同一套查询体系里
- 支持用户导出日志用于复现与问题反馈

## 2. 总体架构

主链路：

`page/store/service -> logger -> logSanitizer -> app_log_append -> Rust 落盘 -> app-log:created -> logBridge -> logCenterStore -> SettingsLogCenterPage`

核心文件：

- 前端
  - [`src/services/logging/logger.ts`](../src/services/logging/logger.ts)
  - [`src/services/logging/logEmitter.ts`](../src/services/logging/logEmitter.ts)
  - [`src/services/logging/logSanitizer.ts`](../src/services/logging/logSanitizer.ts)
  - [`src/services/logging/logBridge.ts`](../src/services/logging/logBridge.ts)
  - [`src/services/logging/consoleCapture.ts`](../src/services/logging/consoleCapture.ts)
  - [`src/services/logging/logStorage.ts`](../src/services/logging/logStorage.ts)
  - [`src/stores/logCenter.ts`](../src/stores/logCenter.ts)
  - [`src/pages/SettingsLogCenterPage.vue`](../src/pages/SettingsLogCenterPage.vue)
- Rust
  - [`src-tauri/src/logging/mod.rs`](../src-tauri/src/logging/mod.rs)
  - [`src-tauri/src/logging/storage.rs`](../src-tauri/src/logging/storage.rs)
  - [`src-tauri/src/logging/types.rs`](../src-tauri/src/logging/types.rs)

## 3. 日志记录结构

统一类型见：

- [`src/types/log.ts`](../src/types/log.ts)

关键字段：

- `id`
- `timestamp`
- `level`
- `category`
- `source`
- `action`
- `message`
- `detail`
- `context`
- `windowLabel`
- `requestId`
- `traceId`
- `success`
- `durationMs`
- `errorStack`
- `ingestSeq`
- `visibility`

字段含义建议：

- `requestId`
  - 同一次具体调用的标识，例如一次翻译或一次原生命令
- `traceId`
  - 用于串联跨层链路，例如“翻译解析 -> Provider 请求 -> 结果展示”
- `detail`
  - 结构化附加信息，优先放可筛选、可序列化对象
- `context`
  - 较大的上下文对象，只有确实对排障有帮助时再写
- `visibility`
  - `user` 为默认可见日志，`debug` 为调试日志
- `ingestSeq`
  - 由 Rust 侧补充，确保多窗口实时日志排序稳定

## 4. 分类与来源

### 分类 `AppLogCategory`

- `app`
- `settings`
- `translation`
- `provider`
- `cache`
- `window`
- `shortcut`
- `external-input`
- `network`
- `error`
- `storage`
- `debug`

### 来源 `AppLogSource`

- `frontend`
- `page`
- `store`
- `service`
- `tauri`
- `rust`
- `provider`
- `window-manager`
- `cache`
- `system-input`

经验法则：

- “从哪里发出来”决定 `source`
- “这条日志主要服务哪个业务域”决定 `category`

## 5. 存储与导出

Rust 统一负责日志持久化。

### 落盘目录

- 日志目录：`<app-data>/logs`
- 导出目录：`<app-data>/exports`

### 文件格式

- 按天拆分的 `ndjson`
- 文件名：`YYYY-MM-DD.ndjson`

这样做的原因：

- 便于追加写入
- 查询与导出简单
- 不依赖单个前端窗口是否存活
- 前后端日志天然统一

## 6. 运行时配置

日志设置定义在：

- [`src/constants/app.ts`](../src/constants/app.ts)
- [`src/stores/appConfig.ts`](../src/stores/appConfig.ts)

当前已接入并生效的关键项：

- `enabled`
- `minLevel`
- `enableVerboseDebug`
- `retainDays`
- `maxEntries`
- `maxFileSizeMb`
- `captureFrontendErrors`
- `captureConsoleErrors`
- `detailedRequestLogging`

配置更新后，前端会调用 `app_log_update_config`，Rust 侧立即更新清理策略。

### 清理策略

Rust 侧会根据以下条件清理旧日志：

- 最长保留天数
- 最大日志条数
- 最大总存储体积

实现见：

- [`src-tauri/src/logging/storage.rs`](../src-tauri/src/logging/storage.rs)

## 7. 前端捕获范围

前端当前会主动记录：

- 应用启动成功
- 设置变更
- 翻译请求开始 / 成功 / 失败
- 缓存命中 / 未命中 / 读写失败
- Provider 请求开始 / 成功 / 回退 / 失败
- 窗口打开 / 隐藏 / 聚焦 / 结果分发
- 全局快捷键与系统输入快捷键注册 / 触发
- 系统输入状态、会话、回写结果
- Vue 运行时错误
- `window.onerror`
- `unhandledrejection`
- `console.warn` / `console.error`（在开启 console 捕获时）

启动相关接线可见：

- [`src/main.ts`](../src/main.ts)

## 8. Rust 捕获范围

Rust 当前已接入的重点日志包括：

- `app_log_append` 统一收日志
- 系统输入命令成功 / 失败
- Provider 请求与流式事件
- 更新检查等原生命令

例如系统输入命令日志入口在：

- [`src-tauri/src/commands/system_input.rs`](../src-tauri/src/commands/system_input.rs)

## 9. 多窗口同步机制

主同步路径是 Rust 事件广播：

1. 任意窗口调用 `app_log_append`
2. Rust 写入文件并发出 `app-log:created`
3. 所有窗口的 `logBridge` 收到事件
4. `logCenterStore.append()` 把日志合并到内存列表
5. 日志中心页面实时刷新

同时保留前端侧的兜底同步能力，避免单一桥接失败时完全失去可见性。

## 10. 日志中心页面能力

页面文件：

- [`src/pages/SettingsLogCenterPage.vue`](../src/pages/SettingsLogCenterPage.vue)

当前支持：

- 级别筛选
- 分类筛选
- 来源筛选
- 关键字筛选
- `requestId` / `traceId` 精确筛选
- 时间范围筛选
- 暂停实时刷新
- 恢复并合并缓冲日志
- 自动滚动到最新
- 清空日志
- 导出 `JSON` / `TXT`
- 抽屉查看 `detail / context / stack`
- 一键筛选同 `requestId` / `traceId`

内存态管理在：

- [`src/stores/logCenter.ts`](../src/stores/logCenter.ts)

## 11. 脱敏与写日志约定

所有日志在发送前都应经过脱敏：

- `apiKey`
- `token`
- `authorization`
- `cookie`
- `password`
- `secret`

此外还会：

- 对大文本做摘要
- 截断图片 / Base64 / 长上下文
- 默认不把整段原文或整段译文直接写进日志

实现见：

- [`src/services/logging/logSanitizer.ts`](../src/services/logging/logSanitizer.ts)

### 推荐写法

- 结构化内容放 `detail`
- 超大原始对象不要直接塞日志
- 一条跨层链路尽量带上 `requestId` 和 `traceId`
- 失败日志尽量带 `errorStack`
- 仅调试可见内容放 `visibility: "debug"`

## 12. 新增日志时的落点建议

### 页面交互

放在 `page` 层，适合记录：

- 用户点击动作
- 页面状态切换
- 明确的窗口行为

### store 编排

放在 `store` 层，适合记录：

- 业务流程开始 / 成功 / 失败
- 状态同步
- 缓存 / 历史写入

### service / provider

放在 `service` 层，适合记录：

- 外部调用参数摘要
- 平台桥接
- Provider 请求和回退

### Rust 命令

放在原生命令层，适合记录：

- 原生输入输出结果
- 文件系统、系统 API、桌面能力错误

## 13. 已知边界

- 日志系统已经可以支撑日常排障，但还没有按天分页或 ZIP 导出。
- `persistMinLevel` 目前只是配置结构的一部分，当前实现的主要运行时开关仍围绕 `minLevel` 与 `enableVerboseDebug`。
- 对非常大的上下文对象，导出文件仍可能增长较快，写日志时要主动控制粒度。

## 14. 后续建议

- 补充分页或按天查询
- 增加 ZIP 导出
- 将问题反馈流程接到日志导出
- 为系统输入增强增加更多原生细粒度日志
- 继续统一前端与 Rust 的动作命名规范
