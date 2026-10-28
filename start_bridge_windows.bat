@echo off
chcp 65001 >nul
title Yotathai Chrome Agent Bridge (Antigravity Ultra)
cd /d "%~dp0"
echo ========================================================
echo   กำลังเปิดระบบเชื่อม ช่างถึก AI กับ Antigravity (Windows)...
echo   (เปิดหน้าต่างนี้ทิ้งไว้ หรือย่อลงแถบด้านล่างได้เลยครับ)
echo ========================================================
python server\bridge_server.py
pause
