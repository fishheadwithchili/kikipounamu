# Start API Server
# Handles virtual environment activation and dependency checks

# Exit immediately on error
$ErrorActionPreference = "Stop"

# Get script directory and navigate to project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

Write-Host "Starting ASR API Server" -ForegroundColor Cyan
Write-Host "=======================" -ForegroundColor Cyan
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

# Configuration
if ($env:API_PORT) {
    $Port = [int]$env:API_PORT
} else {
    $Port = 8000
}

if ($env:API_HOST) {
    $ApiHost = $env:API_HOST
} else {
    $ApiHost = "0.0.0.0"
}

# 1. Check FFmpeg
Write-Host ""
Write-Host "Checking FFmpeg..." -ForegroundColor Yellow
$ffmpegCmd = Get-Command "ffmpeg" -ErrorAction SilentlyContinue
if (-not $ffmpegCmd) {
    Write-Host "Error: FFmpeg not found." -ForegroundColor Red
    Write-Host "   Please install FFmpeg and add it to your PATH."
    Write-Host "   Download from: https://www.gyan.dev/ffmpeg/builds/"
    exit 1
}
Write-Host "FFmpeg found." -ForegroundColor Green

# 2. Check and Install uv
Write-Host "Checking uv..." -ForegroundColor Yellow
$uvCmd = Get-Command "uv" -ErrorAction SilentlyContinue
if (-not $uvCmd) {
    Write-Host "uv not found. Installing..." -ForegroundColor Yellow
    pip install uv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Failed to install uv." -ForegroundColor Red
        exit 1
    }
}
Write-Host "uv is available." -ForegroundColor Green

# 3. Sync dependencies
Write-Host ""
Write-Host "Syncing dependencies with uv..." -ForegroundColor Yellow
uv sync
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to sync dependencies." -ForegroundColor Red
    exit 1
}

# 4. Activate virtual environment if exists
$venvPath = ".venv\Scripts\Activate.ps1"
$venvPath2 = "venv\Scripts\Activate.ps1"

if (Test-Path $venvPath) {
    Write-Host "Activating virtual environment (.venv)..." -ForegroundColor Yellow
    & $venvPath
}
elseif (Test-Path $venvPath2) {
    Write-Host "Activating virtual environment (venv)..." -ForegroundColor Yellow
    & $venvPath2
}

# 5. Kill existing process on port
Write-Host ""
Write-Host "Checking port $Port..." -ForegroundColor Yellow
$tcpConnection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($tcpConnection) {
    $pidToKill = $tcpConnection.OwningProcess | Select-Object -First 1
    Write-Host "Port $Port is in use by PID $pidToKill. Killing..." -ForegroundColor Yellow
    Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
    Write-Host "Port freed." -ForegroundColor Green
    Start-Sleep -Seconds 1
} else {
    Write-Host "Port $Port is available." -ForegroundColor Green
}

# 6. Start Server
Write-Host ""
Write-Host "Launching Uvicorn..." -ForegroundColor Cyan
Write-Host "   Host: $ApiHost"
Write-Host "   Port: $Port"
Write-Host ""

# Using 'uv run' handles venv activation automatically
uv run uvicorn src.api.main:app --host $ApiHost --port $Port
