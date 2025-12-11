@echo off
chcp 65001 >nul
cd /d "%~dp0"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=2" %%a in ('wmic process where "commandline like '%%ququ%%' and name='electron.exe'" get processid /format:list ^| findstr "="') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 /nobreak >nul
call .venv\Scripts\activate.bat
pnpm run dev >> ququ-dev.log 2>&1

