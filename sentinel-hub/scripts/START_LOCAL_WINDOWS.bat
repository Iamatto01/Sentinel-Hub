@echo off
title Sentinel Local Windows Launcher
echo ========================================================
echo   SENTINEL LOCAL WINDOWS RUNTIME (FAST & LIGHTWEIGHT)
echo ========================================================
echo.

cd /d "F:\Sentinel Hub"

echo [1/3] Starting SentinelAI Backend (Port 5000)...
start "SentinelAI Backend" cmd /k "cd /d F:\Sentinel Hub\backend\SentinelAI && npm run dev"

echo [2/3] Starting SentinelMaster Hub (Port 3000)...
start "SentinelMaster Hub" cmd /k "cd /d F:\Sentinel Hub\frontend\SentinelMaster && node server.cjs"

echo [3/3] Starting SentinelAI Frontend (Port 5173)...
start "SentinelAI Frontend" cmd /k "cd /d F:\Sentinel Hub\frontend\SentinelAI && npm run preview"

echo.
echo ========================================================
echo   All core Sentinel services launched locally!
echo   - SentinelMaster Hub: http://localhost:3000
echo   - SentinelAI Backend: http://localhost:5000
echo   - SentinelAI Frontend: http://localhost:5173
echo ========================================================
pause
