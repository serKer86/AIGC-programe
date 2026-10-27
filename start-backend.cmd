@echo off
chcp 65001 >nul
set "PATH=E:\Qoder_Projects\.tools\python;%PATH%"
cd /d "%~dp0backend"

python -m uvicorn main:app --host 127.0.0.1 --port 8000
pause
