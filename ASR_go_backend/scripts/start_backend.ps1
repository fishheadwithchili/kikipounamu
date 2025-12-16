# Start ASR Go Backend
# Handles dependency checks and server startup

# Exit immediately on error
$ErrorActionPreference = "Stop"

# Get script directory and navigate to project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

Write-Host "Starting ASR Go Backend..." -ForegroundColor Cyan
Write-Host "==========================" -ForegroundColor Cyan
Write-Host "Working Directory: $ProjectRoot"

# Load environment variables from .env if exists
if (Test-Path ".env") {
    Write-Host "Loading environment from .env..."
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^([^#][^=]*)=(.*)$") {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

# 1. Check Go
Write-Host ""
Write-Host "Checking Go..." -ForegroundColor Yellow
$goCmd = Get-Command "go" -ErrorAction SilentlyContinue
if (-not $goCmd) {
    Write-Host "Error: Go is not installed." -ForegroundColor Red
    Write-Host "   Please install Go 1.21+ from https://go.dev/dl/"
    exit 1
}
$goVersion = go version
Write-Host "Go found: $goVersion" -ForegroundColor Green

# 2. Check FFmpeg
Write-Host "Checking FFmpeg..." -ForegroundColor Yellow
$ffmpegCmd = Get-Command "ffmpeg" -ErrorAction SilentlyContinue
if (-not $ffmpegCmd) {
    Write-Host "Error: FFmpeg not found." -ForegroundColor Red
    Write-Host "   Go Backend requires ffmpeg for audio processing."
    Write-Host "   Download from: https://www.gyan.dev/ffmpeg/builds/"
    exit 1
}
Write-Host "FFmpeg found." -ForegroundColor Green

# 3. Tidy Modules
Write-Host ""
Write-Host "Checking dependencies (go mod tidy)..." -ForegroundColor Yellow
go mod tidy
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to tidy modules." -ForegroundColor Red
    exit 1
}
Write-Host "Dependencies are up to date." -ForegroundColor Green

# 4. Build server
Write-Host ""
Write-Host "Building server..." -ForegroundColor Yellow

# Ensure output directory exists
if (-not (Test-Path "bin")) {
    New-Item -ItemType Directory -Path "bin" | Out-Null
}

go build -o bin/server.exe cmd/server/main.go
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Build failed." -ForegroundColor Red
    exit 1
}
Write-Host "Build successful." -ForegroundColor Green

# 5. Run Server
Write-Host ""
Write-Host "Starting server..." -ForegroundColor Cyan
Write-Host ""

# Run the compiled binary
& .\bin\server.exe
