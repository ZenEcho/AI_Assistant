# 图片翻译 E2E 联调脚本

图片翻译当前链路：

`本地 OCR -> AI 翻译 OCR 文本 -> 生成覆盖图 -> 输出纯文本译文`

## 脚本入口

```powershell
pnpm test:image-translation:e2e
```

这个脚本会调用 Rust 侧的手工 E2E 测试，并输出以下产物：

- `ocr-result.json`
- `translated-blocks.json`
- `translated.txt`
- `translated-overlay.svg`

默认输出目录：

```text
artifacts/manual-image-translation/<timestamp>/
```

## 模型配置来源

脚本优先顺序如下：

1. 显式传入的环境变量或脚本参数
2. `%APPDATA%\com.ai.translation\app-config.json` 中已启用的模型

如果两者都没有，脚本会失败，并提示你先配置可用模型。

## 常用示例

直接使用应用里已经启用的模型：

```powershell
pnpm test:image-translation:e2e
```

指定 OCR 引擎：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test-image-translation-e2e.ps1 `
  -OcrEngine paddleocr
```

指定 OpenAI 兼容接口：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test-image-translation-e2e.ps1 `
  -OcrEngine rapidocr `
  -BaseUrl https://api.openai.com/v1 `
  -ApiKey $env:OPENAI_API_KEY `
  -Model gpt-4o-mini
```

指定本地图片和输出目录：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test-image-translation-e2e.ps1 `
  -ImagePath D:\images\capture.png `
  -OutputDir D:\temp\image-translation-e2e
```

## 可选参数

- `-OcrEngine rapidocr|paddleocr`
- `-ImagePath <本地图片路径>`
- `-OutputDir <输出目录>`
- `-BaseUrl`
- `-ApiKey`
- `-Model`
- `-SystemPrompt`
- `-AppConfigPath`
- `-ImageWidth`
- `-ImageHeight`
