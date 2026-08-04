param(
    [switch]$NoBrowser,
    [switch]$SkipBuild,
    [switch]$UseXamppApache,
    [switch]$ExposeLan
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendPort = 5502
$apiHealthUrl = 'http://127.0.0.1:5087'
$apiListenUrl = if ($ExposeLan) {
    'http://0.0.0.0:5087'
} else {
    'http://127.0.0.1:5087'
}
$frontendUrl = if ($UseXamppApache) {
    'http://127.0.0.1/FormRequestSystem/'
} else {
    "http://127.0.0.1:$frontendPort"
}
$mysql = 'C:\xampp\mysql\bin\mysql.exe'
$mysqld = 'C:\xampp\mysql\bin\mysqld.exe'
$php = 'C:\xampp\php\php.exe'
$apache = 'C:\xampp\apache\bin\httpd.exe'
$htdocs = 'C:\xampp\htdocs'

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
    Write-Host 'Waiting for MariaDB to start on port 3306...' -ForegroundColor Yellow
    for ($i = 0; $i -lt 20; $i++) {
        if (Test-LocalPort 3306) {
            break
        }
        Start-Sleep -Seconds 1
    }
    if (Test-LocalPort 3306) {
        Write-Host 'MariaDB port detected. Waiting 5 seconds for database initialization...' -ForegroundColor Yellow
        Start-Sleep -Seconds 5
    }
}

if (-not (Test-LocalPort 3306)) {
    throw 'MariaDB did not start on port 3306.'
}

& (Join-Path $repo 'Database\setup-xampp.ps1')

$employeeWorkbook = Join-Path $repo 'Database\employees_export_2026-06-17.xlsx'
$activeEmployeeCount = [int](& $mysql `
    '--user=root' `
    '--protocol=tcp' `
    '--host=127.0.0.1' `
    '--port=3306' `
    '--batch' `
    '--skip-column-names' `
    '--execute=SELECT COUNT(*) FROM gate_pass_system.tbl_employees WHERE employment_status_code=''ACTIVE'';'
)

if ((Test-Path $employeeWorkbook) -and $activeEmployeeCount -lt 95) {
    Write-Host 'Importing approved active employee fields...' -ForegroundColor Yellow
    & dotnet run `
        --project "$repo\Backend\Tools\EmployeeImporter\FormRequestSystem.EmployeeImporter.csproj" `
        -- `
        --file $employeeWorkbook `
        --connection 'Server=127.0.0.1;Port=3306;Database=gate_pass_system;User ID=root;Password=;SslMode=None' `
        --apply
    if ($LASTEXITCODE -ne 0) {
        throw 'Employee import failed.'
    }

    $fleetSeed = (Resolve-Path (Join-Path $repo 'Database\seed-fleet.sql')).Path.Replace('\', '/')
    & $mysql `
        '--user=root' `
        '--protocol=tcp' `
        '--host=127.0.0.1' `
        '--port=3306' `
        "--execute=SOURCE $fleetSeed;"
    if ($LASTEXITCODE -ne 0) {
        throw 'Fleet seed failed after employee import.'
    }
}

if ((Test-LocalPort 5087) -and -not $SkipBuild) {
    $listener = Get-NetTCPConnection `
        -LocalPort 5087 `
        -State Listen `
        -ErrorAction SilentlyContinue |
        Select-Object -First 1
    $listenerProcess = if ($listener) {
        Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    }

    if ($listenerProcess -and
        ($listenerProcess.Path -like '*FormRequestSystem.Api*' -or
         $listenerProcess.Path -like '*GatePassSystem.Api*')) {
        Stop-Process -Id $listenerProcess.Id -Force
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            if (-not (Test-LocalPort 5087)) {
                break
            }
            Start-Sleep -Milliseconds 250
        }
    } else {
        throw 'Port 5087 is already used by a process that is not FormRequestSystem.Api or the legacy GatePassSystem.Api.'
    }
}

if (-not (Test-LocalPort 5087)) {
    if (-not $SkipBuild) {
        & dotnet build "$repo\Backend\FormRequestSystem.sln" `
            --configuration Release `
            --disable-build-servers `
            -maxcpucount:1
        if ($LASTEXITCODE -ne 0) {
            throw 'Backend build failed.'
        }
    }

    $apiDirectory = "$repo\Backend\bin\Release\net8.0"
    $apiExe = Join-Path $apiDirectory 'FormRequestSystem.Api.exe'
    $legacyApiExe = Join-Path $apiDirectory 'GatePassSystem.Api.exe'
    $apiExeToRun = if (Test-Path $apiExe) {
        $apiExe
    } elseif (Test-Path $legacyApiExe) {
        $legacyApiExe
    } else {
        throw 'FormRequestSystem.Api.exe was not produced by the build.'
    }
    $apiLogDirectory = Join-Path $repo 'LocalData\logs'
    New-Item -ItemType Directory -Force -Path $apiLogDirectory | Out-Null
    $apiLogStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $apiOutputLog = Join-Path $apiLogDirectory "api-$apiLogStamp.out.log"
    $apiErrorLog = Join-Path $apiLogDirectory "api-$apiLogStamp.err.log"

    $apiCommand = @"
`$env:ASPNETCORE_ENVIRONMENT='Development'
`$env:ASPNETCORE_URLS='$apiListenUrl'
`$env:GATEPASS_DB_CONNECTION='Server=127.0.0.1;Port=3306;Database=gate_pass_system;User ID=root;Password=;Allow User Variables=True;SslMode=None'
`$env:Cors__AllowAnyOrigin='$($ExposeLan.ToString().ToLowerInvariant())'
Set-Location '$apiDirectory'
& '$apiExeToRun'
"@
    Start-Process powershell.exe `
        -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-Command', $apiCommand) `
        -RedirectStandardOutput $apiOutputLog `
        -RedirectStandardError $apiErrorLog `
        -WindowStyle Hidden
}

if ($UseXamppApache) {
    if (-not (Test-Path $apache) -or -not (Test-Path $htdocs)) {
        throw 'XAMPP Apache or htdocs was not found under C:\xampp.'
    }

    $xamppTarget = Join-Path $htdocs 'FormRequestSystem'
    $xamppFrontendTarget = Join-Path $xamppTarget 'Frontend'
    New-Item -ItemType Directory -Force -Path $xamppFrontendTarget | Out-Null
    Copy-Item (Join-Path $repo 'index.html') $xamppTarget -Force
    Copy-Item (Join-Path $repo '.htaccess') $xamppTarget -Force
    Copy-Item (Join-Path $repo 'Frontend\*') $xamppFrontendTarget -Recurse -Force

    if (-not (Test-LocalPort 80)) {
        Start-Process -FilePath $apache -WindowStyle Hidden
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            if (Test-LocalPort 80) {
                break
            }
            Start-Sleep -Milliseconds 500
        }
    }

    if (-not (Test-LocalPort 80)) {
        throw 'XAMPP Apache did not start on port 80.'
    }
} else {
    if (-not (Test-Path $php)) {
        throw 'XAMPP PHP was not found under C:\xampp\php.'
    }

    if (-not (Test-LocalPort $frontendPort)) {
        $phpBindAddress = if ($ExposeLan) { "0.0.0.0:$frontendPort" } else { "127.0.0.1:$frontendPort" }
        $phpArguments = "-S $phpBindAddress -t `"$repo`""
        Start-Process -FilePath $php `
            -ArgumentList $phpArguments `
            -WorkingDirectory $repo `
            -WindowStyle Hidden
    }
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
        $health = Invoke-RestMethod -Uri "$apiHealthUrl/api/health" -TimeoutSec 2
        if ($health.status -eq 'Healthy') {
            $healthy = $true
            break
        }
    } catch {
        Start-Sleep -Milliseconds 500
    }
}

if (-not $healthy) {
    throw 'Form Request API did not become healthy on port 5087.'
}

Write-Host 'Form Request local stack is ready.' -ForegroundColor Green
Write-Host "Frontend: $frontendUrl"
Write-Host "API health: $apiHealthUrl/api/health"
Write-Host "Swagger: $apiHealthUrl/swagger"
if ($apiOutputLog) {
    Write-Host "API log: $apiOutputLog"
    Write-Host "API error log: $apiErrorLog"
}

if ($ExposeLan) {
    $lanAddresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*'
        } |
        Select-Object -ExpandProperty IPAddress -Unique

    foreach ($address in $lanAddresses) {
        $lanFrontend = if ($UseXamppApache) {
            "http://$address/FormRequestSystem/"
        } else {
            "http://${address}:$frontendPort"
        }
        Write-Host "LAN frontend: $lanFrontend"
    }
}

if (-not $NoBrowser) {
    Start-Process $frontendUrl
}

