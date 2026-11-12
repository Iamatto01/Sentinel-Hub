@echo off
title Sentinel Live Auto-Deploy Daemon
echo Starting Sentinel Live Watcher & Auto-Deploy to Kali...
python "%~dp0scripts\watch_and_autodeploy.py"
pause
