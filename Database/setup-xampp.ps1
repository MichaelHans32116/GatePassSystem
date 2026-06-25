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

function Invoke-MySqlScalarInt([string]$Sql) {
    $rows = @(Invoke-MySqlQuery $Sql)
    if ($rows.Count -eq 0) {
        throw "MariaDB scalar query returned no rows: $Sql"
    }
    return [int]([string]$rows[0])
}

$databaseExists = Invoke-MySqlScalarInt `
    "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='gate_pass_system';"

if ($databaseExists -eq 0) {
    Write-Host 'Creating fresh gate_pass_system database...' -ForegroundColor Yellow
    Invoke-MySqlSource 'Database\schema.sql'
} else {
    $requestTableExists = Invoke-MySqlScalarInt `
        "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='gate_pass_system' AND TABLE_NAME='tbl_gate_pass_requests';"

    if ($requestTableExists -eq 0) {
        Invoke-MySqlSource 'Database\schema.sql'
    } else {
        $lifecycleColumns = Invoke-MySqlScalarInt `
            "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='gate_pass_system' AND TABLE_NAME='tbl_gate_pass_requests' AND COLUMN_NAME IN ('applied_at','approval_completed_at','version_no');"

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

        $phase5Applied = Invoke-MySqlScalarInt `
            "SELECT COUNT(*) FROM gate_pass_system.tbl_schema_versions WHERE version_no='003';"

        if ($phase5Applied -eq 0) {
            Write-Host 'Applying database migration 003...' -ForegroundColor Yellow
            Invoke-MySqlSource 'Database\Migrations\003_phase5_workflow_defaults.sql'
        }

        $employeeQrSecurityApplied = Invoke-MySqlScalarInt `
            "SELECT COUNT(*) FROM gate_pass_system.tbl_schema_versions WHERE version_no='004';"

        if ($employeeQrSecurityApplied -eq 0) {
            Write-Host 'Applying database migration 004...' -ForegroundColor Yellow
            Invoke-MySqlSource 'Database\Migrations\004_security_employee_qr.sql'
        }

        $scanCooldownIndexApplied = Invoke-MySqlScalarInt `
            "SELECT COUNT(*) FROM gate_pass_system.tbl_schema_versions WHERE version_no='005';"

        if ($scanCooldownIndexApplied -eq 0) {
            Write-Host 'Applying database migration 005...' -ForegroundColor Yellow
            Invoke-MySqlSource 'Database\Migrations\005_scan_cooldown_index.sql'
        }

        $formRequestApplied = Invoke-MySqlScalarInt `
            "SELECT COUNT(*) FROM gate_pass_system.tbl_schema_versions WHERE version_no='006';"

        if ($formRequestApplied -eq 0) {
            if (-not $SkipBackup) {
                $backupDirectory = Join-Path $repo 'LocalData\backups'
                New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
                $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
                $backup = Join-Path $backupDirectory "gate_pass_system-before-006-$stamp.sql"
                & $mysqldump @connectionArguments `
                    '--single-transaction' `
                    '--routines' `
                    '--triggers' `
                    "--result-file=$backup" `
                    'gate_pass_system'
                if ($LASTEXITCODE -ne 0) {
                    throw 'MariaDB backup failed before migration 006.'
                }
                Write-Host "Database backup: $backup"
            }

            Write-Host 'Applying database migration 006...' -ForegroundColor Yellow
            Invoke-MySqlSource 'Database\Migrations\006_form_request_material_gate_pass.sql'
        }

        $departmentAccessApplied = Invoke-MySqlScalarInt `
            "SELECT COUNT(*) FROM gate_pass_system.tbl_schema_versions WHERE version_no='007';"

        if ($departmentAccessApplied -eq 0) {
            if (-not $SkipBackup) {
                $backupDirectory = Join-Path $repo 'LocalData\backups'
                New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
                $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
                $backup = Join-Path $backupDirectory "gate_pass_system-before-007-$stamp.sql"
                & $mysqldump @connectionArguments `
                    '--single-transaction' `
                    '--routines' `
                    '--triggers' `
                    "--result-file=$backup" `
                    'gate_pass_system'
                if ($LASTEXITCODE -ne 0) {
                    throw 'MariaDB backup failed before migration 007.'
                }
                Write-Host "Database backup: $backup"
            }

            Write-Host 'Applying database migration 007...' -ForegroundColor Yellow
            Invoke-MySqlSource 'Database\Migrations\007_department_access_shared_pas.sql'
        }

        $pasRestrictionApplied = Invoke-MySqlScalarInt `
            "SELECT COUNT(*) FROM gate_pass_system.tbl_schema_versions WHERE version_no='008';"

        if ($pasRestrictionApplied -eq 0) {
            Write-Host 'Applying database migration 008...' -ForegroundColor Yellow
            Invoke-MySqlSource 'Database\Migrations\008_material_gate_pass_pas_restriction.sql'
        }

        $queueViewUpdateApplied = Invoke-MySqlScalarInt `
            "SELECT COUNT(*) FROM gate_pass_system.tbl_schema_versions WHERE version_no='009';"

        if ($queueViewUpdateApplied -eq 0) {
            Write-Host 'Applying database migration 009...' -ForegroundColor Yellow
            Invoke-MySqlSource 'Database\Migrations\009_update_security_gate_queue_view.sql'
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
