@echo off
setlocal

cd /d "%~dp0backend"

if not exist ".venv\Scripts\python.exe" (
  echo [INFO] Creating Python virtual environment...
  py -m venv .venv
)

call ".venv\Scripts\activate.bat"

echo [INFO] Installing backend dependencies...
pip install -r requirements.txt

echo [INFO] Starting backend on http://127.0.0.1:8000 ...
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

endlocal
