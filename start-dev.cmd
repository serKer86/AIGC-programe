@echo off
chcp 65001 >nul
set "PATH=E:\Qoder_Projects\.tools\node;%PATH%"
cd /d "%~dp0"

powershell -NoProfile -Command "try { $null = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173/ -TimeoutSec 1; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  start "" "http://127.0.0.1:5173/"
  exit /b 0
)

npm run dev -- --host --port 5173 --open
pause
