@echo off
rem 由 Windows 服务调用的后端启动包装：切到 backend 目录并写日志
cd /d "%~dp0backend"
if not exist "data" mkdir "data"
".venv\Scripts\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8000 --log-level warning >> "data\uvicorn.log" 2>&1
