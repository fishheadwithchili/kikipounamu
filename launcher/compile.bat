@echo off
set CSC_PATH=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe

echo Compiling TrayLauncher...
"%CSC_PATH%" /target:winexe /out:KikiPounamuLauncher.exe ^
    /reference:System.Windows.Forms.dll ^
    /reference:System.Drawing.dll ^
    TrayLauncher.cs

if %errorlevel% neq 0 (
    echo Compilation Failed!
    pause
    exit /b %errorlevel%
)

echo Compilation Successful! KikiPounamuLauncher.exe created.
pause
