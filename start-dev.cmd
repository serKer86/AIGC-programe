@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ==========================================
echo   校园工具箱 - 本地启动
echo ==========================================
echo.

rem [1/4] 检查 Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 没检测到 Node.js。
  echo.
  echo   请先安装 Node.js 20.19 或更高版本：https://nodejs.org/
  echo   安装时保持默认选项，装完重新双击本文件即可。
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo [1/4] Node.js %%v  OK

rem [2/4] 首次运行自动安装依赖
if not exist "node_modules\vite\package.json" (
  echo [2/4] 首次运行，正在安装依赖，请勿关闭窗口...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo [错误] 依赖安装失败。请检查网络后重新双击本文件。
    echo        国内网络可先执行：npm config set registry https://registry.npmmirror.com
    echo.
    pause
    exit /b 1
  )
) else (
  echo [2/4] 依赖已安装  OK
)

rem [3/4] 服务已在运行就直接开浏览器
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173/ -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  echo [3/4] 服务已在运行，正在打开浏览器...
  start "" "http://127.0.0.1:5173/"
  exit /b 0
)

rem [4/4] 启动服务，固定绑定 127.0.0.1，避免只监听 IPv6 导致打不开
echo [3/4] 正在启动服务...
echo [4/4] 浏览器会自动打开：http://127.0.0.1:5173/
echo.
echo       关闭本窗口即停止服务。
echo.
call npm run dev -- --host 127.0.0.1 --port 5173 --strictPort --open
echo.
echo 服务已停止。如果上面有报错信息，请截图反馈。
pause