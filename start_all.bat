@echo off
setlocal

cd /d "%~dp0"

echo [INFO] Launching backend and frontend in separate terminals...
start "Hybrid Farm Backend" cmd /k "cd /d ""%~dp0"" && call start_backend.bat"
start "Hybrid Farm Frontend" cmd /k "cd /d ""%~dp0"" && call start_frontend.bat"

echo [DONE] Backend: http://127.0.0.1:8000

echo [DONE] Frontend: http://127.0.0.1:5173

echo [DONE] API Docs: http://127.0.0.1:8000/docs

endlocal
