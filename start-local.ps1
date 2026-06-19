param([switch]$NoBrowser, [switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiUrl = 'http://127.0.0.1:5087'
$frontendUrl = 'http://127.0.0.1:5500'
$mysql = 'C:\xampp\mysql\bin\mysql.exe'
$mysqld = 'C:\xampp\mysql\bin\mysqld.exe'
$php = 'C:\xampp\php\php.exe'

function Test-LocalPort([int]$Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $task = $client.ConnectAsync('127.0.0.1', $Port)
        return $task.Wait(500) -and $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

if (-not (Test-Path $mysql) -or -not (Test-Path $mysqld)) {
    throw 'XAMPP MariaDB was not found under C:\xampp\mysql\bin.'
}

if (-not (Test-LocalPort 3306)) {
    Start-Process -FilePath $mysqld `
        -ArgumentList '--defaults-file=C:\xampp\mysql\bin\my.ini' `
        -WindowStyle Hidden
    Start-Sleep -Seconds 4
}

if (-not (Test-LocalPort 3306)) {
    throw 'MariaDB did not start on port 3306.'
}

if (-not (Test-LocalPort 5087)) {
    if (-not $SkipBuild) {
        & dotnet build "$repo\Backend\GatePassSystem.sln" `
            --configuration Release `
            --disable-build-servers `
            -maxcpucount:1
        if ($LASTEXITCODE -ne 0) {
            throw 'Backend build failed.'
        }
    }

    $apiDirectory = "$repo\Backend\bin\Release\net8.0"
    $apiExe = Join-Path $apiDirectory 'GatePassSystem.Api.exe'
    if (-not (Test-Path $apiExe)) {
        throw 'GatePassSystem.Api.exe was not produced by the build.'
    }

    $apiCommand = @"
`$env:ASPNETCORE_ENVIRONMENT='Development'
`$env:ASPNETCORE_URLS='$apiUrl'
`$env:GATEPASS_DB_CONNECTION='Server=127.0.0.1;Port=3306;Database=gate_pass_system;User ID=root;Password=;Allow User Variables=True;SslMode=None'
Set-Location '$apiDirectory'
& '$apiExe'
"@
    Start-Process powershell.exe `
        -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-Command', $apiCommand) `
        -WindowStyle Hidden
}

if (-not (Test-Path $php)) {
    throw 'XAMPP PHP was not found under C:\xampp\php.'
}

if (-not (Test-LocalPort 5500)) {
    Start-Process -FilePath $php `
        -ArgumentList @('-S', '127.0.0.1:5500', '-t', $repo) `
        -WorkingDirectory $repo `
        -WindowStyle Hidden
}

$signaturePython = Join-Path $repo 'Backend\SignatureBackgroundRemoval\.venv\Scripts\python.exe'
if ((Test-Path $signaturePython) -and
    -not (Test-LocalPort 8000)) {
    Start-Process -FilePath $signaturePython `
        -ArgumentList @('-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', '8000') `
        -WorkingDirectory "$repo\Backend\SignatureBackgroundRemoval" `
        -WindowStyle Hidden
}

$healthy = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri "$apiUrl/api/health" -TimeoutSec 2
        if ($health.status -eq 'Healthy') {
            $healthy = $true
            break
        }
    } catch {
        Start-Sleep -Milliseconds 500
    }
}

if (-not $healthy) {
    throw 'Gate Pass API did not become healthy on port 5087.'
}

Write-Host 'Gate Pass local stack is ready.' -ForegroundColor Green
Write-Host "Frontend: $frontendUrl"
Write-Host "API health: $apiUrl/api/health"
Write-Host "Swagger: $apiUrl/swagger"

if (-not $NoBrowser) {
    Start-Process $frontendUrl
}
