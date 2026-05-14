$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$logDir = Join-Path $rootDir "logs"
$pidFile = Join-Path $logDir "app.pid"
$outLog = Join-Path $logDir "app.out.log"
$errLog = Join-Path $logDir "app.err.log"
$port = if ($env:ICOLORING_PORT) { [int]$env:ICOLORING_PORT } else { 3010 }
$bindHost = if ($env:ICOLORING_HOST) { $env:ICOLORING_HOST } else { "127.0.0.1" }
$url = "http://${bindHost}:${port}"
$runtimeDir = Join-Path $rootDir "runtime"
$appDir = if (Test-Path (Join-Path $rootDir "app\package.json")) { Join-Path $rootDir "app" } else { $rootDir }
$runtimeNode = Join-Path $runtimeDir "node.exe"
$nextCli = Join-Path $appDir "node_modules\next\dist\bin\next"

if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

function Test-PortListening {
  param([int]$Port)
  try {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    return $null -ne $listener
  } catch {
    return $false
  }
}

function Get-ExistingProcess {
  if (-not (Test-Path $pidFile)) {
    return $null
  }

  $rawPid = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ([string]::IsNullOrWhiteSpace($rawPid)) {
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    return $null
  }

  try {
    return Get-Process -Id ([int]$rawPid) -ErrorAction Stop
  } catch {
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    return $null
  }
}

$existingProcess = Get-ExistingProcess
if ($existingProcess) {
  Start-Process $url
  Write-Host "Application is already running: $url"
  exit 0
}

if (Test-PortListening -Port $port) {
  Start-Process $url
  Write-Host "Port $port is already in use, opened: $url"
  exit 0
}

$env:NODE_ENV = "production"
$env:PORT = "$port"
$env:HOSTNAME = $bindHost
$env:NEXT_TELEMETRY_DISABLED = "1"

$command = $null
$arguments = @()
if ((Test-Path $runtimeNode) -and (Test-Path $nextCli)) {
  $command = $runtimeNode
  $arguments = @($nextCli, "start", "--hostname", $bindHost, "--port", "$port")
} else {
  $systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
  if ((-not $systemNode) -or (-not (Test-Path $nextCli))) {
    throw "node.exe or Next.js CLI was not found. Run npm install and rebuild the local package."
  }
  $command = $systemNode.Source
  $arguments = @($nextCli, "start", "--hostname", $bindHost, "--port", "$port")
}

$process = Start-Process -FilePath $command -ArgumentList $arguments -WorkingDirectory $appDir -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden -PassThru

Set-Content -Path $pidFile -Value $process.Id -Encoding ASCII

$maxAttempts = 50
for ($attempt = 0; $attempt -lt $maxAttempts; $attempt++) {
  Start-Sleep -Milliseconds 500

  if ($process.HasExited) {
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    $errorText = if (Test-Path $errLog) { Get-Content $errLog -Raw } else { "Application exited unexpectedly." }
    throw $errorText
  }

  if (Test-PortListening -Port $port) {
    Start-Process $url
    Write-Host "Application started: $url"
    exit 0
  }
}

throw "Application did not start in time. Check logs: $outLog and $errLog"
