param(
  [ValidateSet("rapidocr", "paddleocr")]
  [string]$OcrEngine = "rapidocr",
  [string]$ImagePath = "",
  [string]$OutputDir = "",
  [string]$BaseUrl = "",
  [string]$ApiKey = "",
  [string]$Model = "",
  [string]$SystemPrompt = "",
  [string]$AppConfigPath = "",
  [string]$ImageWidth = "",
  [string]$ImageHeight = ""
)

$ErrorActionPreference = "Stop"

function Set-OptionalEnv {
  param(
    [string]$Name,
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    Remove-Item "Env:$Name" -ErrorAction SilentlyContinue
    return
  }

  Set-Item "Env:$Name" $Value
}

$repoRoot = Split-Path -Parent $PSScriptRoot

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputDir = Join-Path $repoRoot "artifacts\manual-image-translation\$timestamp"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Set-Item "Env:AI_TRANSLATION_OCR_ENGINE" $OcrEngine
Set-Item "Env:AI_TRANSLATION_E2E_OUTPUT_DIR" $OutputDir
Set-OptionalEnv -Name "AI_TRANSLATION_E2E_IMAGE_PATH" -Value $ImagePath
Set-OptionalEnv -Name "AI_TRANSLATION_BASE_URL" -Value $BaseUrl
Set-OptionalEnv -Name "AI_TRANSLATION_API_KEY" -Value $ApiKey
Set-OptionalEnv -Name "AI_TRANSLATION_MODEL" -Value $Model
Set-OptionalEnv -Name "AI_TRANSLATION_SYSTEM_PROMPT" -Value $SystemPrompt
Set-OptionalEnv -Name "AI_TRANSLATION_APP_CONFIG_PATH" -Value $AppConfigPath
Set-OptionalEnv -Name "AI_TRANSLATION_E2E_IMAGE_WIDTH" -Value $ImageWidth
Set-OptionalEnv -Name "AI_TRANSLATION_E2E_IMAGE_HEIGHT" -Value $ImageHeight

Write-Host "Running manual image translation E2E..."
Write-Host "OCR Engine : $OcrEngine"
Write-Host "Output Dir : $OutputDir"
if (-not [string]::IsNullOrWhiteSpace($ImagePath)) {
  Write-Host "Image Path : $ImagePath"
}

Push-Location $repoRoot
try {
  cargo test --manifest-path src-tauri/Cargo.toml manual_live_image_translation_ai_e2e -- --ignored --nocapture

  if ($LASTEXITCODE -ne 0) {
    throw "Manual image translation E2E failed."
  }

  Write-Host ""
  Write-Host "Artifacts written to:"
  Write-Host "  $OutputDir"
  Write-Host "Expected files:"
  Write-Host "  ocr-result.json"
  Write-Host "  translated-blocks.json"
  Write-Host "  translated.txt"
  Write-Host "  translated-overlay.svg"
}
finally {
  Pop-Location
}
