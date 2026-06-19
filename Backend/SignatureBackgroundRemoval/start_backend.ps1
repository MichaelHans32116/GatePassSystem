$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path $root '.venv\Scripts\python.exe'

function Find-Python {
    $candidates = @(
        $env:GATEPASS_PYTHON,
        "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe"
    ) | Where-Object { $_ -and (Test-Path $_) }

    foreach ($candidate in $candidates) {
        & $candidate -c "import sys; assert sys.version_info >= (3, 11)"
        if ($LASTEXITCODE -eq 0) {
            return $candidate
        }
    }

    $command = Get-Command python -ErrorAction SilentlyContinue
    if ($command -and $command.Source -notlike '*WindowsApps*') {
        & $command.Source -c "import sys; assert sys.version_info >= (3, 11)"
        if ($LASTEXITCODE -eq 0) {
            return $command.Source
        }
    }

    throw 'Python 3.11 or newer was not found. Set GATEPASS_PYTHON to python.exe.'
}

Set-Location $root

if (-not (Test-Path $venvPython)) {
    $python = Find-Python
    Write-Host 'Creating signature-helper virtual environment...'
    & $python -m venv '.venv'
}

Write-Host 'Installing/updating signature-helper packages...'
& $venvPython -m pip install -r 'requirements.txt'
if ($LASTEXITCODE -ne 0) {
    throw 'Package installation failed.'
}

Write-Host 'Starting automatic signature background removal on port 8000...'
& $venvPython -m uvicorn app:app --host 127.0.0.1 --port 8000
