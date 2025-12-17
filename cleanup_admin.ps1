# One-Click Cleanup Script for KikiPounamu (Admin Required)
# Run this script as Administrator to finish the environment reset.

Write-Host ">>> Starting cleanup..." -ForegroundColor Cyan

# 1. Stop Windows Services
Write-Host "1. Stopping Services..." -ForegroundColor Yellow
try {
    Stop-Service -Name "Redis" -ErrorAction Stop
    Write-Host "   - Redis Stopped." -ForegroundColor Green
} catch {
    Write-Host "   - Redis service not found or already stopped." -ForegroundColor DarkGray
}

try {
    Stop-Service -Name "postgresql-x64-14" -ErrorAction Stop
    Write-Host "   - PostgreSQL Stopped." -ForegroundColor Green
} catch {
    Write-Host "   - PostgreSQL service not found or already stopped." -ForegroundColor DarkGray
}

# 2. Clean System PATH
Write-Host "2. Cleaning System PATH..." -ForegroundColor Yellow
$sysPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
if ($sysPath -like "*Redis*") {
    $newPath = $sysPath -replace ";C:\\Program Files\\Redis\\?", "" -replace "C:\\Program Files\\Redis\\?;?", ""
    [Environment]::SetEnvironmentVariable("Path", $newPath, "Machine")
    Write-Host "   - Removed 'C:\Program Files\Redis' from System Path." -ForegroundColor Green
} else {
    Write-Host "   - System Path is already clean." -ForegroundColor Green
}

Write-Host ">>> Cleanup Complete. You can now test the installer." -ForegroundColor Cyan
Pause
