@echo off
title Pasang Docker Desktop
echo ========================================================
echo   MELANCARKAN INSTALLER DOCKER DESKTOP
echo ========================================================
echo.
echo Sila klik "Yes" apabila paparan User Account Control (UAC) muncul...
echo.
powershell -Command "Start-Process 'E:\.exe penting\Docker Desktop Installer.exe' -Verb RunAs"
pause
