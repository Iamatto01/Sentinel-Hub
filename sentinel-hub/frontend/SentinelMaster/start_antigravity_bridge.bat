@echo off
title 9Router Antigravity OAuth Bridge
echo ========================================================
echo   9Router Antigravity OAuth Relay (Port 443 Bridge)
echo   Listening for Google OAuth callbacks on localhost:443...
echo ========================================================
python "%~dp0scripts\antigravity_oauth_bridge.py"
pause
