@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0backend"

if not exist "data" mkdir "data"

set "PY=.venv\Scripts\python.exe"
if not exist "%PY%" (
  echo [错误] 没找到虚拟环境 backend\.venv
  echo.
  echo   请先在项目根目录执行一次：
  echo     python -m venv backend\.venv
  echo     backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
  echo.
  if /i not "%~1"=="-silent" pause
  exit /b 1
)

if /i "%~1"=="-silent" goto silent

echo 作业提醒后端：http://127.0.0.1:8000    （按 Ctrl+C 停止）
echo.
"%PY%" -m uvicorn main:app --host 127.0.0.1 --port 8000
pause
exit /b 0

:silent
rem 后台模式：不显示窗口，日志写入 data\uvicorn.log 便于排查
"%PY%" -m uvicorn main:app --host 127.0.0.1 --port 8000 --log-level warning >> "data\uvicorn.log" 2>&1
exit /b 0