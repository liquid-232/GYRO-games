@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-game.ps1" -Page spaceplane-preview.html
if errorlevel 1 (
  echo Model preview startup failed. See the error above.
  pause
  exit /b 1
)
exit /b 0
