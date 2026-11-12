@echo off
title Sentinel Websites Power Control Center
echo ===================================================
echo   SENTINEL WEBSITES ON / OFF CONTROL CENTER
echo ===================================================
echo.
echo [1] Launching Web Control Center in your browser...
start "" "%~dp0SENTINEL_CONTROL_CENTER.html"
echo.
echo [2] Opening Sentinel Master Hub on Kali...
start "" "https://hub.sentinelai.studio/kali"
echo.
echo Done! Both dashboards are open.
pause
