@echo off
title Yotathai AI - Windows Auto Installer
color 0E

echo ========================================================
echo   Yotathai AI - Automatic Windows Setup
echo   Please wait 10-20 seconds...
echo ========================================================
echo.

set "INSTALL_DIR=C:\Yotathai_AI"
set "PY_DIR=%INSTALL_DIR%\python"
set "PY_EXE=%PY_DIR%\python.exe"
set "PYW_EXE=%PY_DIR%\pythonw.exe"
set "ZIP_PATH=%TEMP%\yotathai_ai_latest.zip"
set "PY_ZIP=%TEMP%\python_embed_win64.zip"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

if exist "%~dp0extension\manifest.json" (
    echo [1/4] Copying Yotathai AI files to C:\Yotathai_AI ...
    xcopy "%~dp0*" "%INSTALL_DIR%\" /E /I /Y /Q >nul
) else (
    echo [1/4] Downloading Yotathai AI files to C:\Yotathai_AI ...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/yotathai/yotathai-ai-access/archive/refs/heads/main.zip' -OutFile '%ZIP_PATH%' -UseBasicParsing; if (Test-Path '%TEMP%\yt_extract') { Remove-Item '%TEMP%\yt_extract' -Recurse -Force }; Expand-Archive -Path '%ZIP_PATH%' -DestinationPath '%TEMP%\yt_extract' -Force; Copy-Item -Path '%TEMP%\yt_extract\yotathai-ai-access-main\*' -Destination '%INSTALL_DIR%' -Recurse -Force"
)

if not exist "%PY_EXE%" (
    echo [2/4] Installing Portable Python for Windows (First time only)...
    mkdir "%PY_DIR%" 2>nul
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip' -OutFile '%PY_ZIP%' -UseBasicParsing; Expand-Archive -Path '%PY_ZIP%' -DestinationPath '%PY_DIR%' -Force"
) else (
    echo [2/4] Portable Python is ready.
)

echo [3/4] Starting Yotathai AI Bridge Server and Auto-Start...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*bridge_server.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.Run """%PYW_EXE%"" ""%INSTALL_DIR%\server\bridge_server.py""", 0, False
) > "%STARTUP_DIR%\Yotathai_AI_AutoStart.vbs"

wscript.exe "%STARTUP_DIR%\Yotathai_AI_AutoStart.vbs"
powershell -NoProfile -Command "Set-Clipboard -Value 'C:\Yotathai_AI\extension'"

echo [4/4] Opening setup guide in Chrome...
start "" "%INSTALL_DIR%\install_guide.html"

echo.
echo ========================================================
echo   SUCCESS! Yotathai AI is installed at C:\Yotathai_AI
echo ========================================================
timeout /t 4
