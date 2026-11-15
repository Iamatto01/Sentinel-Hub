@echo off
title Antigravity AI Console - Sentinel Hub
echo ========================================================
echo   ANTIGRAVITY AI CONSOLE
echo   Project: Sentinel Hub
echo   Connected to: Sentinel Router / Local AI Gateway
echo ========================================================
echo.
echo Launching Antigravity AI UI in your browser...
start "" "%~dp0antigravity-studio\index.html"
echo.
echo Antigravity AI Console launched successfully!
timeout /t 3 >nul
exit

