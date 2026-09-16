@echo off
setlocal

cd /d "%~dp0frontend"

echo [INFO] Installing frontend dependencies...
call npm install --no-audit --no-fund
if errorlevel 1 (
	echo [ERROR] Frontend dependency installation failed.
	exit /b 1
)

echo [INFO] Starting frontend on http://127.0.0.1:5173 ...
call npm run dev

endlocal
