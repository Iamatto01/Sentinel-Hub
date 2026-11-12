@echo off
title Buka Microsoft Edge Asli (Tanpa Sekatan CAPTCHA)
echo ========================================================
echo   Membuka Microsoft Edge Asli untuk DeepSeek / Kimi
echo   (Mod ini bebas daripada pengesanan automasi bot)
echo ========================================================
echo.
echo Sila log masuk ke DeepSeek atau Kimi di tetingkap yang dibuka.
echo Selepas berjaya log masuk ke dalam chat, anda boleh tutup tetingkap.
echo.

set EDGE="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist %EDGE% set EDGE="C:\Program Files\Microsoft\Edge\Application\msedge.exe"

start "" %EDGE% --user-data-dir="%~dp0.browser_profiles\syifaputrixez" "https://chat.deepseek.com"

echo Tetingkap Edge telah dilancarkan.
