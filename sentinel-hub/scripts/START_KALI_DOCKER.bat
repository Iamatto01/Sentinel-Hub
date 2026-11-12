@echo off
title Sentinel Kali Linux Server (Docker on SSD)
echo ========================================================
echo   SENTINEL KALI LINUX SERVER - DOCKER RUNNING ON SSD
echo ========================================================
echo.

cd /d "C:\SentinelKali"

echo [1/3] Checking Docker daemon...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not running or not installed!
    echo Please make sure Docker Desktop is started.
    pause
    exit /b 1
)

echo [2/3] Building & Starting Sentinel Kali container on SSD...
docker compose up -d

echo [3/3] Checking container status...
docker ps --filter "name=sentinel-kali-node"

echo.
echo ========================================================
echo   Sentinel Kali Server is running!
echo   To enter the Kali terminal:
echo     docker exec -it sentinel-kali-node bash
echo ========================================================
pause
