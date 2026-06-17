@echo off
setlocal

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Creating local Python virtual environment...
    py -m venv .venv
    if errorlevel 1 (
        echo Failed to create the virtual environment. Install Python 3 and try again.
        pause
        exit /b 1
    )
)

call ".venv\Scripts\activate.bat"

echo Installing required packages...
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo Failed to install required packages.
    pause
    exit /b 1
)

echo Starting signature background remover at http://127.0.0.1:8000
python -m uvicorn app:app --host 127.0.0.1 --port 8000

endlocal
