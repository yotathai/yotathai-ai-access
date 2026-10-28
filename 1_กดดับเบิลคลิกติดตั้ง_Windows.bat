@echo off
chcp 65001 >nul
title ติดตั้ง Yotathai AI อัตโนมัติ (สำหรับคุณช่างถึกและผู้ได้รับสิทธิ์)
color 0E

echo ========================================================
echo   🚀 กำลังติดตั้ง Yotathai AI ลงในเครื่องของคุณอัตโนมัติ...
echo   (ไม่ต้องแตกไฟล์เอง ระบบกำลังจัดการให้ทั้งหมดครับ)
echo ========================================================
echo.

set "INSTALL_DIR=%USERPROFILE%\Yotathai_AI"
set "ZIP_PATH=%TEMP%\yotathai_ai_latest.zip"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

echo [1/4] กำลังดาวน์โหลดระบบ Yotathai AI เวอร์ชันล่าสุด...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/yotathai/yotathai-ai-access/archive/refs/heads/main.zip' -OutFile '%ZIP_PATH%'"

echo [2/4] กำลังติดตั้งไฟล์ลงที่ %INSTALL_DIR% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Expand-Archive -Path '%ZIP_PATH%' -DestinationPath '%TEMP%\yt_extract' -Force; Copy-Item -Path '%TEMP%\yt_extract\yotathai-ai-access-main\*' -Destination '%INSTALL_DIR%' -Recurse -Force"

echo [3/4] กำลังตั้งค่าให้เปิดระบบเชื่อม AI อัตโนมัติทุกครั้งที่เปิดคอมพิวเตอร์...
(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.Run "pythonw ""%INSTALL_DIR%\server\bridge_server.py""", 0, False
) > "%STARTUP_DIR%\Yotathai_AI_AutoStart.vbs"

REM สั่งรัน Bridge Server ทันที
wscript.exe "%STARTUP_DIR%\Yotathai_AI_AutoStart.vbs" 2>nul
start /B "" python "%INSTALL_DIR%\server\bridge_server.py" >nul 2>&1

REM คัดลอกที่อยู่โฟลเดอร์ extension ใส่คลิปบอร์ดให้ผู้ใช้กดวาง (Ctrl+V) ได้เลยทันที
echo %INSTALL_DIR%\extension| clip

echo [4/4] กำลังเปิดหน้า Google Chrome...
start chrome "chrome://extensions"

echo.
echo ========================================================
echo   ✅ ติดตั้งระบบหลังบ้านเสร็จสมบูรณ์ 100%% แล้วครับ!
echo ========================================================
echo.
echo   📌 ขั้นตอนสุดท้ายในหน้า Google Chrome ที่เพิ่งเด้งขึ้นมา:
echo      1. เปิดสวิตช์ "โหมดนักพัฒนาซอฟต์แวร์ (Developer mode)" มุมขวาบน
echo      2. กดปุ่ม "โหลดส่วนขยายที่ยังไม่ได้แพ็ก (Load unpacked)" มุมซ้ายบน
echo      3. กดปุ่ม Ctrl+V ในช่องชื่อโฟลเดอร์ แล้วกด Enter ได้เลยครับ!
echo         (ระบบคัดลอกที่อยู่ %INSTALL_DIR%\extension ไว้ให้แล้วครับ)
echo ========================================================
echo.
pause
