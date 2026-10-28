@echo off
chcp 65001 >nul
echo ========================================================
echo   🤖 กำลังติดตั้งและเปิดใช้งาน Yotathai AI (สำหรับ Windows)...
echo ========================================================
set "TARGET_DIR=%USERPROFILE%\Yotathai_AI_Bridge\server"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
copy /Y "%~dp0server\bridge_server.py" "%TARGET_DIR%\bridge_server.py" >nul
set "STARTUP_VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Yotathai_AI_AutoStart.vbs"
echo Set WshShell = CreateObject("WScript.Shell") > "%STARTUP_VBS%"
echo WshShell.Run "pythonw ""%TARGET_DIR%\bridge_server.py""", 0, False >> "%STARTUP_VBS%"
wscript.exe "%STARTUP_VBS%"
echo.
echo ✅ ติดตั้งและเปิดใช้งานสำเร็จ! (ต่อไปเมื่อเปิดคอมจะทำงานเองอัตโนมัติ)
timeout /t 4
