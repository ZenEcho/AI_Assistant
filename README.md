# AI Assistant Desktop

一个基于 `Vue 3 + Tauri 2 + Rust` 的桌面翻译助手，面向“高频翻译 + 桌面输入增强 + 本地排障”场景。当前版本除了常规文本/图片翻译外，已经补齐了自动目标语言决策、Windows 系统输入增强、应用内日志中心、翻译缓存/历史持久化，以及面向发布的 Smoke 测试与产物归档能力。

## 核心能力

- 文本翻译：主窗口输入文本后，在独立结果窗流式查看译文。
- 图片翻译：支持粘贴截图或上传图片，走 OCR + 翻译链路。
- 自动目标语言：当目标语言设为 `auto` 时，会先判断源语言，再决定翻译到系统语言还是 `English`。
- Windows 系统输入增强：支持双 `Alt` / 双空格触发外部输入框翻译，支持自动回填、选中翻译、剪贴板翻译、复用上次译文。
- 目标语言悬浮层：按 `Ctrl+~` 可呼出并循环切换系统输入增强的目标语言。
- 日志中心：前端与 Rust 原生日志统一采集、筛选、导出、清理。
- 本地持久化：模型配置、应用偏好、翻译历史保存在 Tauri Store；翻译缓存保存在 IndexedDB。
- 桌面体验：系统托盘、全局快捷键、关闭行为、自启动、更新检查、多窗口协作。

## 当前版本重点

这轮提交相较早期版本，新增或明显增强了以下能力：

- 系统输入增强完整链路：原生捕获、会话编排、回写策略、失败回退、快捷键动作、目标语言悬浮窗。
- 自动目标语言解析：主翻译页、结果页、历史记录、系统输入通知统一展示自动决策结果。
- 应用内日志中心：统一记录翻译、Provider、窗口、快捷键、系统输入、前端异常和 Rust 侧事件。
- 更完整的测试能力：补齐 Vitest 单测、Rust 原生测试，以及 Notepad Smoke 脚本。
- 更清晰的构建交付：打包产物自动归档到 `artifacts/tauri/...`，减少直接翻 `target/release` 的成本。

## 平台说明

- 应用主体仍然是 Tauri 桌面应用，前端功能本身不局限于 Windows。
- `系统输入增强` 的原生捕获与回写目前以 `Windows` 为主线实现。
- `macOS / Linux` 当前保留了平台目录与状态结构，但未接入同等完整的系统输入原生能力。

如果你要验这轮新增能力，建议优先在 Windows 环境下进行。

## 技术栈

- 前端：`Vue 3`、`TypeScript`、`Vite`、`Pinia`、`Vue Router`
- UI：`Naive UI`、`UnoCSS`
- 桌面端：`Tauri 2`、`Rust`
- 插件：`global-shortcut`、`store`、`notification`、`autostart`、`opener`、`single-instance`
- 测试：`Vitest`、`Vue Test Utils`、`cargo test`
- 工具：`pnpm`、`Storybook`

## 项目结构

```text
.
├─ src/                    # Vue 页面、组件、store、service、类型
├─ src-tauri/              # Tauri 配置、Rust 命令、原生平台实现
├─ scripts/                # 构建归档、Smoke 测试、开发辅助脚本
├─ docs/                   # 面向维护者的开发文档与测试用例
├─ public/                 # 静态资源
└─ .storybook/             # Storybook 配置
```

## 快速开始

### 1. 准备环境

推荐环境：

- `Node.js 20+`
- `pnpm 9+`
- `Rust stable`

Windows 下开发或打包 Tauri 应用时，额外建议确认：

- 已安装 `Microsoft C++ Build Tools`
- 已安装 `WebView2 Runtime`
- 如需 `MSI`，系统已启用 `VBSCRIPT` 可选功能

### 2. 安装依赖

```bash
corepack enable
pnpm install
```

### 3. 启动开发

仅调前端：

```bash
pnpm dev
```

启动桌面应用：

```bash
pnpm tauri dev
```

`pnpm tauri dev` 会先执行 `scripts/tauri-before-dev.mjs`，自动复用或拉起 `1420` 端口的 Vite 服务。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动前端开发服务器 |
| `pnpm tauri dev` | 启动桌面开发模式 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm test` | 启动 Vitest 交互模式 |
| `pnpm test:run` | 单次运行前端单测 |
| `pnpm test:native` | 运行 Rust 侧 `system_input` 测试 |
| `pnpm test:system-input` | 只跑系统输入增强相关前端 + Rust 测试 |
| `pnpm build` | 构建前端产物 |
| `pnpm tauri build` | 打包桌面应用 |
| `pnpm build:desktop` | 打包并归档产物到 `artifacts/tauri/...` |
| `pnpm build:desktop:smoke` | 使用 `src-tauri/tauri.smoke.conf.json` 构建 Smoke 版应用 |
| `pnpm tauri:artifacts` | 对现有打包产物执行归档分类 |
| `pnpm smoke:system-input:notepad` | 使用默认配置执行 Notepad 系统输入 Smoke 测试 |
| `pnpm smoke:system-input:notepad:smokeapp` | 使用 Smoke 包与 Smoke 配置执行 Notepad Smoke 测试 |
| `pnpm storybook` | 启动 Storybook |
| `pnpm build-storybook` | 构建 Storybook 静态站点 |

## 首次使用建议

应用首次启动后，建议按下面顺序完成配置：

1. 打开“设置中心 -> 模型设置”。
2. 新增一个兼容 OpenAI Chat Completions 的模型配置，填写 `Base URL`、`API Key`、`Model`。
3. 启用模型并设置默认模型。
4. 回到翻译页，选择源/目标语言后执行一次文本翻译。
5. 如果要体验系统输入增强，再到“应用设置”里开启系统输入增强并确认快捷键。
6. 如需排障，可进入“日志中心”观察翻译、Provider、窗口和系统输入日志。

## 开发文档

面向维护者的文档已经按这轮提交重写，建议先看下面几份：

- [技术栈与开发指南](./docs/技术栈与开发指南.md)
- [启动与打包](./docs/启动与打包.md)
- [应用内日志中心](./docs/logging-system.md)
- [系统输入增强测试用例](./docs/系统输入增强测试用例.md)
- [自动目标语言测试用例](./docs/自动目标语言测试用例.md)

阅读顺序建议：

1. 先读本 README，建立功能全貌。
2. 再读开发指南，理解页面、store、service、Rust 原生层如何分工。
3. 涉及发布时读启动与打包。
4. 涉及系统输入 / 自动目标 / 日志时，再进入专项文档。

## 打包与交付

常规打包：

```bash
pnpm tauri build
```

推荐对外分发前再执行：

```bash
pnpm build:desktop
```

归档后会得到类似目录：

```text
artifacts/
└─ tauri/
   └─ v0.1.0/
      └─ windows-x64/
         ├─ installers/
         ├─ portable/
         ├─ symbols/
         └─ summary.json
```

含义：

- `installers/`：适合直接发给用户的安装包
- `portable/`：便携版可执行文件
- `symbols/`：调试符号
- `summary.json`：本次归档明细

## 测试建议

如果你要验证本轮新增能力，推荐至少执行：

```bash
pnpm typecheck
pnpm test:run
pnpm test:system-input
pnpm build
```

在 Windows 环境下，如需进一步验证系统输入增强：

```bash
pnpm build:desktop:smoke
pnpm smoke:system-input:notepad:smokeapp
```

## 常见问题

### 1. `pnpm tauri dev` 启动失败

优先检查：

- `1420` 端口是否已被其他项目占用
- Rust / C++ Build Tools / WebView2 是否安装完整
- 当前环境是否允许 Tauri 拉起桌面窗口

### 2. 系统输入增强没有效果

优先检查：

- 当前平台是否为 Windows
- 设置页中是否已开启系统输入增强
- 是否存在至少一个可用模型
- 是否命中了黑名单 / 未命中白名单 / 代码编辑器排除规则
- 当前外部输入框是否支持所选回写方式

### 3. 自动目标语言结果不符合预期

优先检查：

- 目标语言是否真的设成了 `auto`
- 当前输入是否过短、混合多语言或检测置信度过低
- 系统语言是否和你预期的一致

## 后续可继续补充

- 应用截图或动图演示
- GitHub Actions 自动打包
- 更完整的发布流程
- macOS / Linux 系统输入增强支持
