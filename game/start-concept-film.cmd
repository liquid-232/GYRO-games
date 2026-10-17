@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-game.ps1" -Page concept-film.html
if errorlevel 1 (
  echo Animation preview startup failed. See the error above.
  pause
  exit /b 1
)
exit /b 0
