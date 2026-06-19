param([switch]$SkipBackup)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$mysql = 'C:\xampp\mysql\bin\mysql.exe'
$mysqldump = 'C:\xampp\mysql\bin\mysqldump.exe'
$connectionArguments = @(
    '--user=root',
    '--protocol=tcp',
    '--host=127.0.0.1',
    '--port=3306'
)

if (-not (Test-Path $mysql) -or -not (Test-Path $mysqldump)) {
    throw 'XAMPP MariaDB command-line tools were not found.'
}

function Invoke-MySqlQuery([string]$Sql) {
    $output = & $mysql @connectionArguments `
        '--batch' `
        '--skip-column-names' `
        "--execute=$Sql"
    if ($LASTEXITCODE -ne 0) {
        throw "MariaDB query failed: $Sql"
    }
    return @($output)
}

function Invoke-MySqlSource([string]$RelativePath) {
    $path = (Resolve-Path (Join-Path $repo $RelativePath)).Path.Replace('\', '/')
    & $mysql @connectionArguments "--execute=SOURCE $path;"
    if ($LASTEXITCODE -ne 0) {
        throw "MariaDB script failed: $RelativePath"
    }
}

$databaseExists = [int](Invoke-MySqlQuery(
    "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='gate_pass_system';"
))[0]

if ($databaseExists -eq 0) {
    Write-Host 'Creating fresh gate_pass_system database...' -ForegroundColor Yellow
    Invoke-MySqlSource 'Database\schema.sql'
} else {
    $requestTableExists = [int](Invoke-MySqlQuery(
        "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='gate_pass_system' AND TABLE_NAME='tbl_gate_pass_requests';"
    ))[0]

    if ($requestTableExists -eq 0) {
        Invoke-MySqlSource 'Database\schema.sql'
    } else {
        $lifecycleColumns = [int](Invoke-MySqlQuery(
            "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='gate_pass_system' AND TABLE_NAME='tbl_gate_pass_requests' AND COLUMN_NAME IN ('applied_at','approval_completed_at','version_no');"
        ))[0]

        if ($lifecycleColumns -lt 3) {
            if (-not $SkipBackup) {
                $backupDirectory = Join-Path $repo 'LocalData\backups'
                New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
                $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
                $backup = Join-Path $backupDirectory "gate_pass_system-before-002-$stamp.sql"
                & $mysqldump @connectionArguments `
                    '--single-transaction' `
                    '--routines' `
                    '--triggers' `
                    "--result-file=$backup" `
                    'gate_pass_system'
                if ($LASTEXITCODE -ne 0) {
                    throw 'MariaDB backup failed before migration 002.'
                }
                Write-Host "Database backup: $backup"
            }

            Write-Host 'Applying database migration 002...' -ForegroundColor Yellow
            Invoke-MySqlSource 'Database\Migrations\002_gate_pass_lifecycle_timestamps.sql'
        }

        $phase5Applied = [int](Invoke-MySqlQuery(
            "SELECT COUNT(*) FROM gate_pass_system.tbl_schema_versions WHERE version_no='003';"
        ))[0]

        if ($phase5Applied -eq 0) {
            Write-Host 'Applying database migration 003...' -ForegroundColor Yellow
            Invoke-MySqlSource 'Database\Migrations\003_phase5_workflow_defaults.sql'
        }
    }
}

Invoke-MySqlSource 'Database\seed-reference.sql'
Invoke-MySqlSource 'Database\procedures.sql'
Invoke-MySqlSource 'Database\seed-fleet.sql'

$versions = Invoke-MySqlQuery(
    'SELECT version_no FROM gate_pass_system.tbl_schema_versions ORDER BY version_no;'
)
Write-Host "Database schema versions: $($versions -join ', ')" -ForegroundColor Green
