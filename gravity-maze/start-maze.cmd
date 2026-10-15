@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-maze.ps1"
if errorlevel 1 (
 pause
 exit /b 1
)
exit /b 0
