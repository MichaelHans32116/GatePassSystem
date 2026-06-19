param(
    [switch]$NoBrowser,
    [switch]$SkipEmployeeImport
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $repo '.env'
$envExample = Join-Path $repo '.env.example'
$workbook = Join-Path $repo 'Database\employees_export_2026-06-17.xlsx'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker Desktop is not installed or docker.exe is not on PATH.'
}

if (-not (Test-Path $envFile)) {
    Copy-Item $envExample $envFile
    Write-Host 'Created local .env from .env.example.' -ForegroundColor Yellow
}

function Get-LocalSetting([string]$Name, [string]$Default) {
    $line = Get-Content $envFile |
        Where-Object { $_ -match "^$([regex]::Escape($Name))=" } |
        Select-Object -Last 1
    if (-not $line) {
        return $Default
    }
    return ($line -split '=', 2)[1].Trim()
}

$dbPassword = Get-LocalSetting 'GATEPASS_DB_PASSWORD' 'gatepass_local_change_me'
$dbPort = Get-LocalSetting 'GATEPASS_DB_PORT' '3307'
$frontendPort = Get-LocalSetting 'GATEPASS_FRONTEND_PORT' '8080'

Set-Location $repo
& docker compose up --detach --build db signature-helper api frontend
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Compose failed to start the Gate Pass stack.'
}

$healthy = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
        $health = Invoke-RestMethod `
            -Uri "http://127.0.0.1:$frontendPort/api/health" `
            -TimeoutSec 3
        if ($health.status -eq 'Healthy') {
            $healthy = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 2
    }
}

if (-not $healthy) {
    & docker compose ps
    throw 'Docker Gate Pass API did not become healthy.'
}

if (-not $SkipEmployeeImport -and (Test-Path $workbook)) {
    $connection =
        "Server=127.0.0.1;Port=$dbPort;Database=gate_pass_system;" +
        "User ID=gatepass;Password=$dbPassword;SslMode=None"
    & dotnet run `
        --project "$repo\Backend\Tools\EmployeeImporter" `
        -- `
        --file $workbook `
        --connection $connection `
        --apply
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker database employee import failed.'
    }
}

$frontendUrl = "http://127.0.0.1:$frontendPort"
Write-Host 'Docker Gate Pass stack is ready.' -ForegroundColor Green
Write-Host "Frontend: $frontendUrl"
Write-Host "API health: $frontendUrl/api/health"
Write-Host "Swagger: $frontendUrl/swagger"

if (-not $NoBrowser) {
    Start-Process $frontendUrl
}
