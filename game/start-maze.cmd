@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-game.ps1" -Page maze.html
if errorlevel 1 (
  echo Maze startup failed. See the error above.
  pause
  exit /b 1
)
exit /b 0
