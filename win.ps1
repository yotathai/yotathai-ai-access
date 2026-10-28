$ErrorActionPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host "========================================================" -ForegroundColor Yellow
Write-Host "  Yotathai AI - Automatic Windows Installer" -ForegroundColor Yellow
Write-Host "  (Bypassing Windows SmartScreen block 100%)" -ForegroundColor Yellow
Write-Host "========================================================"

$InstallDir = "C:\Yotathai_AI"
$PyDir = "$InstallDir\python"
$PyExe = "$PyDir\python.exe"
$PywExe = "$PyDir\pythonw.exe"
$ZipPath = "$env:TEMP\yotathai_ai_latest.zip"
$PyZip = "$env:TEMP\python_embed_win64.zip"
$StartupDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

Write-Host "[1/4] Downloading Yotathai AI files to C:\Yotathai_AI ..." -ForegroundColor Cyan
Invoke-WebRequest -Uri "https://github.com/yotathai/yotathai-ai-access/archive/refs/heads/main.zip" -OutFile $ZipPath -UseBasicParsing
if (Test-Path "$env:TEMP\yt_extract") { Remove-Item "$env:TEMP\yt_extract" -Recurse -Force }
Expand-Archive -Path $ZipPath -DestinationPath "$env:TEMP\yt_extract" -Force
Copy-Item -Path "$env:TEMP\yt_extract\yotathai-ai-access-main\*" -Destination $InstallDir -Recurse -Force

if (!(Test-Path $PyExe)) {
    Write-Host "[2/4] Installing Portable Python 3.11 for Windows..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $PyDir | Out-Null
    Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip" -OutFile $PyZip -UseBasicParsing
    Expand-Archive -Path $PyZip -DestinationPath $PyDir -Force
} else {
    Write-Host "[2/4] Portable Python is ready." -ForegroundColor Green
}

# ปลดล็อกทุกไฟล์ใน C:\Yotathai_AI ไม่ให้ Windows บล็อกอีกต่อไป
Get-ChildItem -Path $InstallDir -Recurse | Unblock-File

Write-Host "[3/4] Starting Yotathai AI Bridge Server & Auto-Start..." -ForegroundColor Cyan
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*bridge_server.py*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

$VbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """$PywExe"" ""$InstallDir\server\bridge_server.py""", 0, False
"@
Set-Content -Path "$StartupDir\Yotathai_AI_AutoStart.vbs" -Value $VbsContent -Encoding ASCII
Unblock-File -Path "$StartupDir\Yotathai_AI_AutoStart.vbs"

Start-Process -FilePath "wscript.exe" -ArgumentList "`"$StartupDir\Yotathai_AI_AutoStart.vbs`""
Set-Clipboard -Value "C:\Yotathai_AI\extension"

Write-Host "[4/4] Opening Setup Guide in Chrome..." -ForegroundColor Green
Start-Process "$InstallDir\install_guide.html"

Write-Host "========================================================" -ForegroundColor Green
Write-Host "  SUCCESS! Installed at C:\Yotathai_AI" -ForegroundColor Green
Write-Host "========================================================"
Start-Sleep -Seconds 3
