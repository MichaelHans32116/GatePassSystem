$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $repo 'LocalData\public-access\cloudflared.pid'

if (-not (Test-Path $pidFile)) {
    Write-Host 'No active public tunnel PID file was found.'
    exit 0
}

$tunnelPid = Get-Content $pidFile -ErrorAction SilentlyContinue
if ($tunnelPid -and
    (Get-Process -Id $tunnelPid -ErrorAction SilentlyContinue)) {
    Stop-Process -Id $tunnelPid -Force
}

Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
Write-Host 'Public Form Request tunnel stopped.' -ForegroundColor Green
