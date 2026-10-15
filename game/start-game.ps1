param([ValidateSet('index.html', 'maze.html')][string]$Page = 'index.html')
$ErrorActionPreference = 'Stop'
$python = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (-not (Test-Path -LiteralPath $python)) { $python = (Get-Command python -ErrorAction Stop).Source }
& $python (Join-Path $PSScriptRoot 'server.py') --open --page $Page
exit $LASTEXITCODE
