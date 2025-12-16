# Start Unified Workers for Redis Streams ASR Processing
# Uses Consumer Groups for distributed, fault-tolerant processing

$ErrorActionPreference = "Stop"

# Get script directory and navigate to project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

Write-Host "Redis Streams Unified Workers (Windows)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
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

# Detect GPU availability using Python/torch
Write-Host ""
Write-Host "Detecting GPU..." -ForegroundColor Yellow
$hasGPU = $false
try {
    $gpuCheck = uv run python -c "import torch; print(torch.cuda.is_available())" 2>$null
    if ($gpuCheck -eq "True") {
        $hasGPU = $true
        Write-Host "GPU detected (CUDA available)" -ForegroundColor Green
    } else {
        Write-Host "No GPU detected, running in CPU mode" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Could not detect GPU, assuming CPU mode" -ForegroundColor Yellow
}

# Configuration with defaults (GPU=2 workers, CPU=1 worker)
if ($env:WORKER_COUNT) {
    $WorkerCount = [int]$env:WORKER_COUNT
} else {
    if ($hasGPU) { $WorkerCount = 2 } else { $WorkerCount = 1 }
}

if ($env:STREAM_NAME) { $StreamName = $env:STREAM_NAME } else { $StreamName = "asr_tasks" }
if ($env:CONSUMER_GROUP) { $GroupName = $env:CONSUMER_GROUP } else { $GroupName = "asr_workers" }

Write-Host ""
Write-Host "Stream: $StreamName"
Write-Host "Group:  $GroupName"
Write-Host "Workers: $WorkerCount"
Write-Host ""

# 1. Check FFmpeg
Write-Host "Checking FFmpeg..." -ForegroundColor Yellow
$ffmpegCmd = Get-Command "ffmpeg" -ErrorAction SilentlyContinue
if (-not $ffmpegCmd) {
    Write-Host "Error: FFmpeg not found." -ForegroundColor Red
    Write-Host "Please install FFmpeg and add it to your PATH."
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

# 4. Start Workers using uv run (automatically uses .venv)
Write-Host ""
Write-Host "Starting $WorkerCount Unified Workers..." -ForegroundColor Cyan

for ($i = 1; $i -le $WorkerCount; $i++) {
    $WorkerName = "worker-$i"
    Write-Host "   Starting $WorkerName..."
    
    # Use powershell -NoExit to keep window open even if worker crashes
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot'; uv run python src/worker/unified_worker.py --name $WorkerName --stream $StreamName --group $GroupName"
    
    Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "All $WorkerCount workers started in new windows." -ForegroundColor Green
Write-Host ""
Write-Host "Monitor stream: redis-cli XINFO STREAM $StreamName" -ForegroundColor Cyan
Write-Host "Monitor group:  redis-cli XINFO GROUPS $StreamName" -ForegroundColor Cyan
Write-Host "Monitor pending: redis-cli XPENDING $StreamName $GroupName" -ForegroundColor Cyan
Write-Host ""
Write-Host "Close those windows to stop workers" -ForegroundColor Yellow
