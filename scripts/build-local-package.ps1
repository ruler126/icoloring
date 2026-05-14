$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$distDir = Join-Path $rootDir "dist-local"
$packageDir = Join-Path $distDir "FreeFishLocalApp"
$appDir = Join-Path $packageDir "app"
$runtimeDir = Join-Path $packageDir "runtime"
$scriptsDir = Join-Path $packageDir "scripts"
$logsDir = Join-Path $packageDir "logs"

$requiredPaths = @(
  ".next",
  "public",
  "src",
  "storage",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "postcss.config.mjs",
  "next-env.d.ts",
  "start.bat",
  "stop.bat",
  "launch.vbs",
  "scripts\start-local.ps1",
  "scripts\stop-local.ps1",
  "scripts\start-local-hidden.vbs"
)

foreach ($relativePath in $requiredPaths) {
  $fullPath = Join-Path $rootDir $relativePath
  if (-not (Test-Path $fullPath)) {
    throw "Missing required file: $relativePath"
  }
}

if (Test-Path $distDir) {
  try {
    [System.IO.Directory]::Delete($distDir, $true)
  } catch {
    Start-Sleep -Milliseconds 500
    cmd /c rmdir /s /q "$distDir" | Out-Null
  }
}

$null = New-Item -ItemType Directory -Path $distDir -Force
$null = New-Item -ItemType Directory -Path $appDir -Force
$null = New-Item -ItemType Directory -Path $runtimeDir -Force
$null = New-Item -ItemType Directory -Path $scriptsDir -Force
$null = New-Item -ItemType Directory -Path $logsDir -Force

$copyPaths = @(
  ".next",
  "public",
  "src",
  "storage",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "postcss.config.mjs",
  "next-env.d.ts",
  "node_modules"
)

foreach ($relativePath in $copyPaths) {
  $source = Join-Path $rootDir $relativePath
  if (Test-Path $source) {
    Copy-Item -Path $source -Destination $appDir -Recurse -Force
  }
}

$scriptFiles = @(
  "start-local.ps1",
  "stop-local.ps1",
  "start-local-hidden.vbs"
)

foreach ($name in $scriptFiles) {
  Copy-Item -Path (Join-Path $scriptDir $name) -Destination $scriptsDir -Force
}

Copy-Item -Path (Join-Path $rootDir "start.bat") -Destination $packageDir -Force
Copy-Item -Path (Join-Path $rootDir "stop.bat") -Destination $packageDir -Force
Copy-Item -Path (Join-Path $rootDir "launch.vbs") -Destination $packageDir -Force

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  throw "node.exe was not found in PATH. Install Node.js first or copy a Node runtime into the package runtime folder."
}

$nodeDir = Split-Path -Parent $nodeCommand.Source
$runtimeFiles = @("node.exe")
foreach ($runtimeFile in $runtimeFiles) {
  $source = Join-Path $nodeDir $runtimeFile
  if (Test-Path $source) {
    Copy-Item -Path $source -Destination $runtimeDir -Force
  }
}

Write-Host "Local package created: $packageDir"