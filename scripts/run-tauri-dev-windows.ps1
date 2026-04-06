param(
  [string]$VsDevCmd = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
)

if (-not (Test-Path $VsDevCmd)) {
  throw "VsDevCmd.bat not found. Install Visual Studio Build Tools 2022 with the C++ workload first."
}

$vsEnvCommand = "`"$VsDevCmd`" -arch=x64 -host_arch=x64 >nul && set"
cmd /c $vsEnvCommand | ForEach-Object {
  if ($_ -match '^(.*?)=(.*)$') {
    Set-Item -Path ("Env:{0}" -f $matches[1]) -Value $matches[2]
  }
}

$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if ((Test-Path $cargoBin) -and -not (($env:Path -split ';') -contains $cargoBin)) {
  $env:Path += ";$cargoBin"
}

pnpm tauri dev
