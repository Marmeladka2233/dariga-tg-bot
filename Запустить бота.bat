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

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$connection = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; " ^
  "if ($null -eq $connection) { exit 0 }; " ^
  "$process = Get-CimInstance Win32_Process -Filter \"ProcessId = $($connection.OwningProcess)\"; " ^
  "if ($null -eq $process) { exit 0 }; " ^
  "$commandLine = $process.CommandLine; " ^
  "if (($process.Name -eq 'node.exe' -or $process.Name -eq 'node') -and (" ^
  "  $commandLine -like '*src/index.ts*' -or " ^
  "  $commandLine -like '*dist/index.js*' -or " ^
  "  $commandLine -like '*dariga_tg_bot*src/index.ts*' -or " ^
  "  $commandLine -like '*dariga_tg_bot*dist/index.js*'" ^
  ")) { " ^
  "  Write-Host 'Stopping previous Dariga backend instance on port 3000...'; " ^
  "  Stop-Process -Id $process.ProcessId -Force; " ^
  "  Start-Sleep -Milliseconds 700; " ^
  "  exit 0 " ^
  "}; " ^
  "Write-Host 'Port 3000 is already in use by another application:'; " ^
  "Write-Host $commandLine; " ^
  "exit 2"
if errorlevel 2 (
  echo.
  echo Could not start the bot because port 3000 is used by another program.
  echo Close that program and run this file again.
  pause
  exit /b 1
)

call npm.cmd --prefix backend run dev

echo.
echo The process has stopped. Press any key to close this window.
pause >nul
