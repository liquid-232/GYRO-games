param(
    [ValidateSet('build', 'menuconfig', 'flash', 'monitor', 'flash-monitor', 'doctor', 'shell')]
    [string]$Action = 'build',
    [string]$Port = 'COM29'
)
$ErrorActionPreference = 'Stop'
. 'C:\Espressif\tools\Microsoft.v6.0.2.PowerShell_profile.ps1'
$espProjectDir = Join-Path $PSScriptRoot '..\firmware'
if ($Action -eq 'shell') {
    Set-Location $espProjectDir
    return
}
if ($Action -eq 'doctor') {
    idf.py --version
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    python "$env:IDF_PATH\tools\idf_tools.py" check
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    python "$env:IDF_PATH\tools\idf_tools.py" check-python-dependencies
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    riscv32-esp-elf-gcc --version
    python -m serial.tools.list_ports -v
    exit $LASTEXITCODE
}
$espIdfArgs = @('-C', $espProjectDir)
if ($Action -in @('flash', 'monitor', 'flash-monitor')) {
    $espIdfArgs += @('-p', $Port, '-b', '460800')
}
if ($Action -eq 'flash-monitor') { $espIdfArgs += @('flash', 'monitor') }
else { $espIdfArgs += $Action }
idf.py @espIdfArgs
exit $LASTEXITCODE

