$ErrorActionPreference = 'Stop'
$desktopPath = [Environment]::GetFolderPath('Desktop')
$link = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktopPath '重力滚球.lnk'))
$link.TargetPath = Join-Path $PSScriptRoot 'start-maze.cmd'
$link.WorkingDirectory = $PSScriptRoot
$link.IconLocation = (Join-Path $PSScriptRoot 'gravity-maze.ico') + ',0'
$link.Description = '重力滚球迷宫 · 蓝牙 / USB / 键盘'
$link.Save()