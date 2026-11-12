@echo off
title Sentinel AI Studio - Chat Console
echo ========================================================
echo   SENTINEL AI STUDIO - REAL CHAT CONSOLE
echo   Connected to: https://router.sentinelai.studio/v1
echo ========================================================
echo.
echo Melancarkan Sentinel AI Studio dalam pelayar web anda...
start "" "%~dp0SENTINEL_AI_STUDIO.html"
echo.
echo Selesai! Konsol AI telah dibuka.
timeout /t 3 >nul
exit
