$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$logDir = Join-Path $rootDir "logs"
$pidFile = Join-Path $logDir "app.pid"

if (-not (Test-Path $pidFile)) {
  Write-Host "Application is not running."
  exit 0
}

$rawPid = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($rawPid)) {
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
  Write-Host "PID file was empty and has been removed."
  exit 0
}

try {
  Stop-Process -Id ([int]$rawPid) -Force -ErrorAction Stop
  Write-Host "Application stopped."
}
catch {
  Write-Host "Process not found. PID file has been cleaned."
}

Remove-Item $pidFile -Force -ErrorAction SilentlyContinue