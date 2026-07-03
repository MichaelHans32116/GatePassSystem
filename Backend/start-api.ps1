$ErrorActionPreference = 'Stop'

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$exePath = Join-Path $baseDir 'FormRequestSystem.Api.exe'

if (-not (Test-Path $exePath)) {
    throw "API executable not found: $exePath"
}

$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ASPNETCORE_URLS = 'http://0.0.0.0:5087'

Start-Process -FilePath $exePath -WorkingDirectory $baseDir -WindowStyle Hidden
