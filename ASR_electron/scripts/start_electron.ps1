# Start ASR Electron App
# Handles dependency checks and app startup

# Exit immediately on error
$ErrorActionPreference = "Stop"

# Get script directory and navigate to project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

Write-Host "Starting ASR Electron App..." -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan
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

# 1. Check Node.js
Write-Host ""
Write-Host "Checking Node.js..." -ForegroundColor Yellow
$nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "Error: Node.js is not installed." -ForegroundColor Red
    Write-Host "   Please install Node.js (v18+ recommended) from https://nodejs.org/"
    exit 1
}
$nodeVersion = node --version
Write-Host "Node.js found: $nodeVersion" -ForegroundColor Green

# 2. Check npm
Write-Host "Checking npm..." -ForegroundColor Yellow
$npmCmd = Get-Command "npm" -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    Write-Host "Error: npm is not installed." -ForegroundColor Red
    exit 1
}
$npmVersion = npm --version
Write-Host "npm found: v$npmVersion" -ForegroundColor Green

# 3. Install dependencies if needed
Write-Host ""
Write-Host "Checking dependencies..." -ForegroundColor Yellow

$needsInstall = $false

if (-not (Test-Path "node_modules")) {
    Write-Host "   node_modules not found. Installing dependencies..."
    $needsInstall = $true
} else {
    # Check if package.json is newer than node_modules
    $packageJsonTime = (Get-Item "package.json").LastWriteTime
    $nodeModulesTime = (Get-Item "node_modules").LastWriteTime
    
    if ($packageJsonTime -gt $nodeModulesTime) {
        Write-Host "   package.json is newer than node_modules. Updating dependencies..."
        $needsInstall = $true
    } else {
        Write-Host "   Dependencies look up to date."
    }
}

if ($needsInstall) {
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Failed to install dependencies." -ForegroundColor Red
        exit 1
    }
    Write-Host "Dependencies installed." -ForegroundColor Green
} else {
    Write-Host "Dependencies are up to date." -ForegroundColor Green
}

# 4. Start Electron
Write-Host ""
Write-Host "Starting Electron App..." -ForegroundColor Cyan
Write-Host ""

npm run dev
