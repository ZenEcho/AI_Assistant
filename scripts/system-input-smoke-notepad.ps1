param(
  [string]$AppExecutable = "",
  [string]$ConfigPath = "$env:APPDATA\com.example.aiassistant\app-config.json",
  [string]$ModelSourceConfigPath = "$env:APPDATA\com.example.aiassistant\app-config.json",
  [string]$SourceText = "hello world from smoke test",
  [ValidateSet("double-alt", "double-space")]
  [string]$TriggerMode = "double-alt",
  [ValidateSet("smoke-file", "input")]
  [string]$TriggerTransport = "smoke-file",
  [ValidateSet("before-caret-first", "selection-first", "whole-input-first")]
  [string]$CaptureMode = "before-caret-first",
  [ValidateSet("auto", "native-replace", "simulate-input", "clipboard-paste", "popup-only")]
  [string]$WritebackMode = "auto",
  [string]$TargetLanguage = "Chinese (Simplified)",
  [int]$TimeoutSeconds = 25,
  [switch]$SkipAppRestart,
  [switch]$SkipAppLaunch,
  [switch]$NoRestoreConfig,
  [switch]$KeepNotepad,
  [switch]$KeepAppRunning
)

$ErrorActionPreference = "Stop"

Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$repoRoot = Split-Path -Path $PSScriptRoot -Parent

$user32Source = @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class SmokeUser32
{
    public const uint KEYEVENTF_KEYUP = 0x0002;
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    public static void KeyPress(ushort vk)
    {
        keybd_event((byte)vk, 0, 0, UIntPtr.Zero);
        keybd_event((byte)vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    public static void KeyChord(ushort modifier, ushort key)
    {
        keybd_event((byte)modifier, 0, 0, UIntPtr.Zero);
        keybd_event((byte)key, 0, 0, UIntPtr.Zero);
        keybd_event((byte)key, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event((byte)modifier, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }
}
"@

Add-Type -TypeDefinition $user32Source | Out-Null

function Resolve-AppExecutable {
  param(
    [string]$ExplicitPath
  )

  $candidates = @()

  if ($ExplicitPath) {
    $candidates += $ExplicitPath
  }

  $candidates += @(
    (Join-Path $repoRoot "artifacts\tauri\v0.1.0\windows-x64\portable\ai-assistant.exe"),
    (Join-Path $repoRoot "src-tauri\target\release\ai-assistant.exe"),
    (Join-Path $repoRoot "src-tauri\target\debug\ai-assistant.exe")
  )

  foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }

    $resolved = Resolve-Path -Path $candidate -ErrorAction SilentlyContinue
    if ($resolved) {
      return $resolved.Path
    }
  }

  throw "No AI Assistant executable was found. Pass -AppExecutable explicitly."
}

function ConvertTo-Hashtable {
  param(
    [Parameter(ValueFromPipeline = $true)]
    $InputObject
  )

  if ($null -eq $InputObject) {
    return $null
  }

  if ($InputObject -is [System.Collections.IDictionary]) {
    $table = @{}
    foreach ($key in $InputObject.Keys) {
      $table[$key] = ConvertTo-Hashtable -InputObject $InputObject[$key]
    }
    return $table
  }

  if ($InputObject -is [System.Collections.IEnumerable] -and -not ($InputObject -is [string])) {
    $items = @()
    foreach ($item in $InputObject) {
      $items += ,(ConvertTo-Hashtable -InputObject $item)
    }
    return $items
  }

  if ($InputObject -is [pscustomobject]) {
    $table = @{}
    foreach ($property in $InputObject.PSObject.Properties) {
      $table[$property.Name] = ConvertTo-Hashtable -InputObject $property.Value
    }
    return $table
  }

  return $InputObject
}

function Get-ClipboardTextSafe {
  try {
    return Get-Clipboard -Raw
  } catch {
    return $null
  }
}

function Set-ClipboardTextSafe {
  param([AllowNull()][string]$Text)

  if ($null -eq $Text) {
    Set-Clipboard -Value ""
    return
  }

  Set-Clipboard -Value $Text
}

function Write-Utf8NoBomText {
  param(
    [string]$Path,
    [string]$Text
  )

  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $encoding)
}

function Write-SmokeTrace {
  param([string]$Message)

  if (-not $script:SmokeTracePath) {
    return
  }

  $timestamp = (Get-Date).ToString("o")
  Add-Content -Path $script:SmokeTracePath -Value "[$timestamp] $Message" -Encoding UTF8
}

function Get-SmokeLogTail {
  param(
    [string]$Path,
    [int]$Tail = 20
  )

  if (-not (Test-Path $Path)) {
    return @()
  }

  $lines = [System.IO.File]::ReadAllLines($Path)
  if ($lines.Length -le $Tail) {
    return @($lines)
  }

  return @($lines[($lines.Length - $Tail)..($lines.Length - 1)])
}

function Wait-ForSmokeAppReady {
  param(
    [string]$SmokeLogFile,
    [int]$TimeoutSeconds = 15
  )

  if ([string]::IsNullOrWhiteSpace($SmokeLogFile)) {
    return $true
  }

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    $lines = Get-SmokeLogTail -Path $SmokeLogFile -Tail 40
    if (@($lines | Where-Object { $_ -like "*build_status: enabled=true*" -and $_ -like "*active=true*" }).Count -gt 0) {
      return $true
    }

    Start-Sleep -Milliseconds 500
  }

  return $false
}

function Focus-Window {
  param(
    [System.Diagnostics.Process]$Process
  )

  $null = $Process.Refresh()

  if ($Process.MainWindowHandle -eq 0) {
    return $false
  }

  [SmokeUser32]::ShowWindowAsync($Process.MainWindowHandle, 5) | Out-Null
  [Microsoft.VisualBasic.Interaction]::AppActivate($Process.Id) | Out-Null
  Start-Sleep -Milliseconds 200
  [SmokeUser32]::SetForegroundWindow($Process.MainWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 200
  return $true
}

function Wait-ForMainWindow {
  param(
    [System.Diagnostics.Process]$Process,
    [int]$TimeoutSeconds = 15
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    $null = $Process.Refresh()

    if ($Process.HasExited) {
      throw "Target process exited: $($Process.ProcessName)"
    }

    if ($Process.MainWindowHandle -ne 0) {
      return $Process
    }

    Start-Sleep -Milliseconds 300
  }

  throw "Timed out waiting for window: $($Process.ProcessName)"
}

function Send-CtrlChord {
  param([ValidateSet("A", "C", "V")][string]$Key)

  $vkMap = @{
    A = 0x41
    C = 0x43
    V = 0x56
  }

  [SmokeUser32]::KeyChord(0x11, [uint16]$vkMap[$Key])
}

function Send-Key {
  param([uint16]$VirtualKey)
  [SmokeUser32]::KeyPress($VirtualKey)
}

function Send-Trigger {
  param(
    [string]$Mode,
    [string]$Transport,
    [string]$TriggerFile
  )

  if ($Transport -eq "smoke-file") {
    if ([string]::IsNullOrWhiteSpace($TriggerFile)) {
      throw "Trigger transport 'smoke-file' requires a trigger file path."
    }

    $payload = @{
      requestId = [guid]::NewGuid().ToString("N")
      triggerMode = $Mode
      requestedAt = (Get-Date).ToString("o")
    } | ConvertTo-Json -Compress

    Write-Utf8NoBomText -Path $TriggerFile -Text $payload
    return
  }

  switch ($Mode) {
    "double-alt" {
      Send-Key 0x12
      Start-Sleep -Milliseconds 120
      Send-Key 0x12
    }
    "double-space" {
      Send-Key 0x20
      Start-Sleep -Milliseconds 120
      Send-Key 0x20
    }
    default {
      throw "Unsupported trigger mode: $Mode"
    }
  }
}

function Get-NotepadDocumentElement {
  param(
    [System.Diagnostics.Process]$NotepadProcess
  )

  $null = $NotepadProcess.Refresh()
  if ($NotepadProcess.MainWindowHandle -eq 0) {
    throw "Notepad main window handle is unavailable."
  }

  $root = [System.Windows.Automation.AutomationElement]::FromHandle($NotepadProcess.MainWindowHandle)
  if ($null -eq $root) {
    throw "Failed to resolve the Notepad automation root."
  }

  $condition = New-Object System.Windows.Automation.AndCondition(
    (New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
      [System.Windows.Automation.ControlType]::Document
    )),
    (New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ClassNameProperty,
      "RichEditD2DPT"
    ))
  )

  $document = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
  if ($null -eq $document) {
    throw "Failed to locate the Notepad editor document."
  }

  return $document
}

function Focus-NotepadEditor {
  param(
    [System.Diagnostics.Process]$NotepadProcess
  )

  Focus-Window -Process $NotepadProcess | Out-Null
  $document = Get-NotepadDocumentElement -NotepadProcess $NotepadProcess
  $document.SetFocus()
  Start-Sleep -Milliseconds 150
  return $document
}

function Set-NotepadText {
  param(
    [System.Diagnostics.Process]$NotepadProcess,
    [string]$Text
  )

  $document = Focus-NotepadEditor -NotepadProcess $NotepadProcess
  $valuePattern = $document.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
  $valuePattern.SetValue($Text)
  Start-Sleep -Milliseconds 250
  $document.SetFocus()
  Start-Sleep -Milliseconds 120
  Send-Key 0x23
  Start-Sleep -Milliseconds 150
}

function Read-NotepadText {
  param(
    [System.Diagnostics.Process]$NotepadProcess
  )

  $document = Get-NotepadDocumentElement -NotepadProcess $NotepadProcess

  try {
    $valuePattern = $document.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    $text = $valuePattern.Current.Value
  } catch {
    $textPattern = $document.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
    $text = $textPattern.DocumentRange.GetText(-1)
  }

  if ($null -eq $text) {
    return $null
  }

  return $text.TrimEnd("`r", "`n")
}

function Get-VisibleWindowTitlesForProcessIds {
  param(
    [int[]]$ProcessIds
  )

  $normalizedIds = @($ProcessIds | Where-Object { $_ -gt 0 } | Select-Object -Unique)
  if ($normalizedIds.Count -eq 0) {
    return @()
  }

  $titles = New-Object System.Collections.Generic.List[string]
  $callback = [SmokeUser32+EnumWindowsProc]{
    param([IntPtr]$hwnd, [IntPtr]$lParam)

    if (-not [SmokeUser32]::IsWindowVisible($hwnd)) {
      return $true
    }

    [uint32]$windowPid = 0
    [SmokeUser32]::GetWindowThreadProcessId($hwnd, [ref]$windowPid) | Out-Null

    if ($normalizedIds -notcontains [int]$windowPid) {
      return $true
    }

    $builder = New-Object System.Text.StringBuilder 512
    [SmokeUser32]::GetWindowText($hwnd, $builder, $builder.Capacity) | Out-Null
    $title = $builder.ToString().Trim()

    if (-not [string]::IsNullOrWhiteSpace($title)) {
      $titles.Add($title) | Out-Null
    }

    return $true
  }

  [SmokeUser32]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
  return @($titles | Select-Object -Unique)
}

function Normalize-SmokeText {
  param(
    [AllowNull()][string]$Text
  )

  if ($null -eq $Text) {
    return $null
  }

  return $Text.TrimEnd()
}

function Update-SystemInputConfig {
  param(
    [string]$FilePath
  )

  if (-not (Test-Path $FilePath)) {
    throw "Config file was not found: $FilePath"
  }

  $raw = Get-Content -Path $FilePath -Raw -Encoding UTF8
  $config = ConvertTo-Hashtable -InputObject ($raw | ConvertFrom-Json)

  if (-not $config.ContainsKey("app-config")) {
    throw "Config file is missing the app-config root node."
  }

  $appConfig = $config["app-config"]
  $preferences = $appConfig["preferences"]
  $models = @($appConfig["models"])
  $enabledModels = @($models | Where-Object { $_.enabled -eq $true })

  if ($enabledModels.Count -eq 0) {
    if ((Test-Path $ModelSourceConfigPath) -and ((Resolve-Path $ModelSourceConfigPath).Path -ne (Resolve-Path $FilePath).Path)) {
      $sourceRaw = Get-Content -Path $ModelSourceConfigPath -Raw -Encoding UTF8
      $sourceConfig = ConvertTo-Hashtable -InputObject ($sourceRaw | ConvertFrom-Json)
      $sourceAppConfig = $sourceConfig["app-config"]
      $sourcePreferences = $sourceAppConfig["preferences"]
      $sourceModels = @($sourceAppConfig["models"] | Where-Object { $_.enabled -eq $true })

      if ($sourceModels.Count -gt 0) {
        $appConfig["models"] = @($sourceAppConfig["models"])
        $models = @($appConfig["models"])
        $enabledModels = @($models | Where-Object { $_.enabled -eq $true })
        $preferences["selectedTranslationModelId"] = $sourcePreferences["selectedTranslationModelId"]
      }
    }
  }

  if ($enabledModels.Count -eq 0) {
    throw "No enabled model is available for the real external-app smoke test."
  }

  if (-not $preferences.ContainsKey("selectedTranslationModelId") -or [string]::IsNullOrWhiteSpace([string]$preferences["selectedTranslationModelId"])) {
    $preferences["selectedTranslationModelId"] = $enabledModels[0]["id"]
  }

  $preferences["systemInput"] = @{
    enabled = $true
    triggerMode = $TriggerMode
    doubleTapIntervalMs = 280
    appBlacklist = @()
    appWhitelist = @()
    sourceLanguage = "auto"
    targetLanguage = $TargetLanguage
    onlySelectedText = $false
    autoReplace = $true
    enableClipboardFallback = $true
    showFloatingHint = $false
    onlyWhenEnglishText = $false
    excludeCodeEditors = $true
    debugLogging = $true
    captureMode = $CaptureMode
    writebackMode = $WritebackMode
  }

  Write-Utf8NoBomText -Path $FilePath -Text ($config | ConvertTo-Json -Depth 50)

  return @{
    selectedModelId = $preferences["selectedTranslationModelId"]
    selectedModelName = ($enabledModels | Where-Object { $_.id -eq $preferences["selectedTranslationModelId"] } | Select-Object -First 1).name
  }
}

function Stop-AiAssistantProcesses {
  $processes = @(Get-Process -Name "ai-assistant" -ErrorAction SilentlyContinue)

  foreach ($process in $processes) {
    try {
      if ($process.MainWindowHandle -ne 0) {
        $process.CloseMainWindow() | Out-Null
      }
    } catch {}
  }

  if ($processes.Count -gt 0) {
    Start-Sleep -Milliseconds 1200
  }

  foreach ($process in $processes) {
    try {
      $process.Refresh()
      if (-not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -ErrorAction Stop
      }
    } catch {
      try {
        $process.Refresh()
        if (-not $process.HasExited) {
          throw "Failed to stop ai-assistant process $($process.Id): $($_.Exception.Message)"
        }
      } catch {
        throw
      }
    }
  }
}

function Start-AiAssistant {
  param(
    [string]$ExecutablePath,
    [string]$SmokeTriggerFile,
    [string]$SmokeLogFile
  )

  $previousTriggerFile = $env:AI_ASSISTANT_SYSTEM_INPUT_SMOKE_TRIGGER_FILE
  $previousLogFile = $env:AI_ASSISTANT_SYSTEM_INPUT_SMOKE_LOG_FILE

  if ($SmokeTriggerFile) {
    $env:AI_ASSISTANT_SYSTEM_INPUT_SMOKE_TRIGGER_FILE = $SmokeTriggerFile
  }

  if ($SmokeLogFile) {
    $env:AI_ASSISTANT_SYSTEM_INPUT_SMOKE_LOG_FILE = $SmokeLogFile
  }

  try {
    $process = Start-Process -FilePath $ExecutablePath -PassThru
  } finally {
    if ($null -eq $previousTriggerFile) {
      Remove-Item Env:AI_ASSISTANT_SYSTEM_INPUT_SMOKE_TRIGGER_FILE -ErrorAction SilentlyContinue
    } else {
      $env:AI_ASSISTANT_SYSTEM_INPUT_SMOKE_TRIGGER_FILE = $previousTriggerFile
    }

    if ($null -eq $previousLogFile) {
      Remove-Item Env:AI_ASSISTANT_SYSTEM_INPUT_SMOKE_LOG_FILE -ErrorAction SilentlyContinue
    } else {
      $env:AI_ASSISTANT_SYSTEM_INPUT_SMOKE_LOG_FILE = $previousLogFile
    }
  }

  return Wait-ForMainWindow -Process $process -TimeoutSeconds 20
}

function Start-NotepadWindow {
  param(
    [string]$DocumentPath
  )

  if (-not (Test-Path $DocumentPath)) {
    New-Item -Path $DocumentPath -ItemType File -Force | Out-Null
  }

  $targetName = [System.IO.Path]::GetFileName($DocumentPath)
  Start-Process -FilePath "notepad.exe" -ArgumentList ('"{0}"' -f $DocumentPath) | Out-Null
  $deadline = (Get-Date).AddSeconds(20)

  while ((Get-Date) -lt $deadline) {
    $visibleWindows = @(Get-Process -Name "Notepad" -ErrorAction SilentlyContinue |
      Sort-Object StartTime -Descending |
      Where-Object { $_.MainWindowHandle -ne 0 })

    $candidate = $visibleWindows |
      Where-Object { $_.MainWindowTitle -like "*$targetName*" } |
      Select-Object -First 1

    if ($candidate) {
      return $candidate
    }

    $foregroundHandle = [SmokeUser32]::GetForegroundWindow()
    if ($foregroundHandle -ne [IntPtr]::Zero) {
      $candidate = $visibleWindows |
        Where-Object { $_.MainWindowHandle -eq $foregroundHandle } |
        Select-Object -First 1

      if ($candidate) {
        return $candidate
      }
    }

    Start-Sleep -Milliseconds 300
  }

  throw "Timed out waiting for a Notepad window for document: $targetName"
}

function New-SmokeResult {
  [ordered]@{
    startedAt = (Get-Date).ToString("o")
    appExecutable = $null
    configPath = $ConfigPath
    triggerMode = $TriggerMode
    triggerTransport = $TriggerTransport
    captureMode = $CaptureMode
    writebackMode = $WritebackMode
    targetLanguage = $TargetLanguage
    sourceText = $SourceText
    selectedModelId = $null
    selectedModelName = $null
    notepadPid = $null
    notepadDocumentPath = $null
    aiAssistantPid = $null
    aiAssistantWindowTitles = @()
    smokeTriggerFile = $null
    smokeLogFile = $null
    smokeLogTail = @()
    initialNotepadText = $null
    finalNotepadText = $null
    replaced = $false
    fallbackDetected = $false
    status = "pending"
    error = $null
    finishedAt = $null
  }
}

$result = New-SmokeResult
$originalConfig = $null
$startedAppProcess = $null
$notepadProcess = $null
$resolvedAppExecutable = $null
$originalClipboard = $null
$notepadDocumentPath = $null
$smokeTriggerFile = $null
$smokeLogFile = $null
$script:SmokeTracePath = $null

try {
  $reportDir = Join-Path $repoRoot "artifacts\smoke"
  New-Item -Path $reportDir -ItemType Directory -Force | Out-Null
  $script:SmokeTracePath = Join-Path $reportDir "system-input-smoke-script.log"
  Remove-Item -Path $script:SmokeTracePath -Force -ErrorAction SilentlyContinue
  Write-SmokeTrace "smoke run started"

  $resolvedAppExecutable = Resolve-AppExecutable -ExplicitPath $AppExecutable
  $result.appExecutable = $resolvedAppExecutable
  $originalClipboard = Get-ClipboardTextSafe
  $smokeTriggerFile = Join-Path $reportDir "system-input-smoke-trigger.json"
  $smokeLogFile = Join-Path $reportDir "system-input-smoke-native.log"
  Remove-Item -Path $smokeTriggerFile -Force -ErrorAction SilentlyContinue
  Remove-Item -Path $smokeLogFile -Force -ErrorAction SilentlyContinue
  $result.smokeTriggerFile = $smokeTriggerFile
  $result.smokeLogFile = $smokeLogFile
  Write-SmokeTrace "resolved executable and prepared artifact files"

  $originalConfig = Get-Content -Path $ConfigPath -Raw -Encoding UTF8
  $configState = Update-SystemInputConfig -FilePath $ConfigPath
  $result.selectedModelId = $configState.selectedModelId
  $result.selectedModelName = $configState.selectedModelName
  Write-SmokeTrace "updated system input config"

  if (-not $SkipAppRestart) {
    Stop-AiAssistantProcesses
    Start-Sleep -Milliseconds 800
    Write-SmokeTrace "stopped existing ai-assistant processes"
  }

  if (-not $SkipAppLaunch) {
    $startedAppProcess = Start-AiAssistant -ExecutablePath $resolvedAppExecutable -SmokeTriggerFile $smokeTriggerFile -SmokeLogFile $smokeLogFile
    $result.aiAssistantPid = $startedAppProcess.Id
    Write-SmokeTrace "launched smoke app"

    if (-not (Wait-ForSmokeAppReady -SmokeLogFile $smokeLogFile -TimeoutSeconds 15)) {
      $logTail = Get-SmokeLogTail -Path $smokeLogFile -Tail 20
      throw ("Smoke app did not report an active enabled system-input runtime within the expected time. Native log tail: " + ($logTail -join " | "))
    }

    Write-SmokeTrace "smoke app reported active enabled runtime"
  }

  $notepadDocumentPath = Join-Path $env:TEMP ("ai-assistant-smoke-{0}.txt" -f ([guid]::NewGuid().ToString("N")))
  $result.notepadDocumentPath = $notepadDocumentPath

  $notepadProcess = Start-NotepadWindow -DocumentPath $notepadDocumentPath
  $result.notepadPid = $notepadProcess.Id
  Write-SmokeTrace "started and resolved notepad window"

  Set-NotepadText -NotepadProcess $notepadProcess -Text $SourceText
  $result.initialNotepadText = Read-NotepadText -NotepadProcess $notepadProcess
  Write-SmokeTrace "seeded notepad text"

  if ($result.initialNotepadText -ne $SourceText) {
    throw "Failed to seed Notepad with the expected source text."
  }

  Focus-NotepadEditor -NotepadProcess $notepadProcess | Out-Null
  Send-Trigger -Mode $TriggerMode -Transport $TriggerTransport -TriggerFile $smokeTriggerFile
  Write-SmokeTrace "sent trigger"

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $finalText = $result.initialNotepadText

  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 700
    if ($startedAppProcess) {
      $aiAssistantPids = @($startedAppProcess.Id)
    } else {
      $aiAssistantPids = @(Get-Process -Name "ai-assistant" -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    }

    $windowTitles = @(Get-VisibleWindowTitlesForProcessIds -ProcessIds $aiAssistantPids)

    if ($windowTitles.Count -gt 0) {
      $result.aiAssistantWindowTitles = $windowTitles
      if (@($windowTitles | Where-Object { $_ -like "*AI Assistant Result*" -or $_ -like "*Result*" }).Count -gt 0) {
        $result.fallbackDetected = $true
      }
    }

    Write-SmokeTrace "polling for text replacement"
    $finalText = Read-NotepadText -NotepadProcess $notepadProcess
    if (-not [string]::IsNullOrWhiteSpace($finalText) -and $finalText -ne $SourceText) {
      break
    }
  }

  $result.finalNotepadText = $finalText
  $normalizedSourceText = Normalize-SmokeText -Text $SourceText
  $normalizedFinalText = Normalize-SmokeText -Text $finalText
  $result.replaced = -not [string]::IsNullOrWhiteSpace($normalizedFinalText) -and $normalizedFinalText -ne $normalizedSourceText

  if ($result.replaced) {
    $result.status = "passed"
  } elseif ($WritebackMode -eq "popup-only" -and $result.fallbackDetected) {
    $result.status = "passed"
  } else {
    $result.status = "failed"
    if ($result.fallbackDetected) {
      $result.error = "Detected a result-window fallback, but no in-place Notepad replacement."
    } else {
      $result.error = "Timed out without detecting a Notepad text replacement."
    }
  }
} catch {
  $result.status = "error"
  $result.error = $_.Exception.Message
} finally {
  $result.finishedAt = (Get-Date).ToString("o")
  Write-SmokeTrace "entering finally block"

  $reportPath = Join-Path $reportDir "system-input-notepad-latest.json"

  if ($smokeLogFile -and (Test-Path $smokeLogFile)) {
    try {
      $result.smokeLogTail = @(Get-SmokeLogTail -Path $smokeLogFile -Tail 20)
    } catch {}
  }

  $result | ConvertTo-Json -Depth 20 | Set-Content -Path $reportPath -Encoding UTF8
  Write-SmokeTrace "wrote smoke result report"

  if (-not $KeepNotepad -and $notepadProcess -and -not $notepadProcess.HasExited) {
    try {
      $notepadProcess.CloseMainWindow() | Out-Null
      Start-Sleep -Milliseconds 300
      if (-not $notepadProcess.HasExited) {
        $notepadProcess | Stop-Process -Force
      }
    } catch {}
  }

  if (-not $NoRestoreConfig -and $null -ne $originalConfig) {
    try {
      Write-Utf8NoBomText -Path $ConfigPath -Text $originalConfig
    } catch {}
  }

  if ($null -ne $originalClipboard) {
    try {
      Set-ClipboardTextSafe -Text $originalClipboard
    } catch {}
  }

  if ($notepadDocumentPath -and (Test-Path $notepadDocumentPath)) {
    try {
      Remove-Item -Path $notepadDocumentPath -Force -ErrorAction SilentlyContinue
    } catch {}
  }

  if ($smokeTriggerFile -and (Test-Path $smokeTriggerFile)) {
    try {
      Remove-Item -Path $smokeTriggerFile -Force -ErrorAction SilentlyContinue
    } catch {}
  }

  if ($SkipAppRestart) {
    if (-not $KeepAppRunning -and $startedAppProcess) {
      try {
        $startedAppProcess.Refresh()
        if (-not $startedAppProcess.HasExited) {
          $startedAppProcess.CloseMainWindow() | Out-Null
          Start-Sleep -Milliseconds 500
          $startedAppProcess.Refresh()
          if (-not $startedAppProcess.HasExited) {
            Stop-Process -Id $startedAppProcess.Id -Force -ErrorAction SilentlyContinue
          }
        }
      } catch {}
    }
  } else {
    try {
      Stop-AiAssistantProcesses
      Start-Sleep -Milliseconds 500

      if (($KeepAppRunning -or -not $NoRestoreConfig) -and $resolvedAppExecutable) {
        Start-AiAssistant -ExecutablePath $resolvedAppExecutable | Out-Null
      }
    } catch {}
  }

  $result | ConvertTo-Json -Depth 20

  if ($result.status -ne "passed") {
    exit 1
  }
}
