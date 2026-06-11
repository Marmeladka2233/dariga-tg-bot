@echo off
title Dariga TG Bot
cd /d "%~dp0"

echo ==============================
echo   Dariga TG Bot launcher
echo ==============================
echo.
echo Backend + Telegram bot will start in this window.
echo Do not close this window while the bot is running.
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Please install Node.js and try again.
  pause
  exit /b 1
)

call npm.cmd --prefix backend run dev

echo.
echo The process has stopped. Press any key to close this window.
pause >nul
