# 把本机后端注册成 Windows 服务（需要管理员权限）
# 右键「使用 PowerShell 运行」，或在管理员 PowerShell 里执行：
#   powershell -ExecutionPolicy Bypass -File .\install-backend-service.ps1

$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "需要管理员权限：请右键此脚本 -> 使用 PowerShell 运行（以管理员身份）" -ForegroundColor Yellow
    Read-Host "按回车退出"
    exit 1
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$wrapper = Join-Path $root 'service-backend.cmd'
if (-not (Test-Path $wrapper)) {
    Write-Host "找不到 service-backend.cmd，终止" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

$name = 'ToolboxBackend'
$binPath = 'cmd.exe /c "' + $wrapper + '"'

# 停掉旧的用户态进程，避免抢 8000 端口
$existing = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "停止占用 8000 端口的手工进程 PID $($existing.OwningProcess)…"
    Stop-Process -Id $existing.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

$svc = Get-Service -Name $name -ErrorAction SilentlyContinue
if ($svc) {
    Write-Host "服务已存在，更新启动路径…"
    sc.exe config $name binPath= "$binPath" start= auto | Out-Null
} else {
    Write-Host "创建服务 $name…"
    New-Service -Name $name -BinaryPathName $binPath -DisplayName '校园工具箱后端 (FastAPI)' -Description '校园工具箱：本机 FastAPI 后端，仅监听 127.0.0.1:8000' -StartupType Automatic | Out-Null
}

# 崩溃自动重启：5 秒 / 15 秒 / 60 秒，计数每天重置
sc.exe failure $name reset= 86400 actions= restart/5000/restart/15000/restart/60000 | Out-Null
sc.exe description $name '校园工具箱：本机 FastAPI 后端，仅监听 127.0.0.1:8000' | Out-Null

Write-Host "启动服务…"
Start-Service -Name $name
Start-Sleep -Seconds 6

try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/api/health' -UseBasicParsing -TimeoutSec 10
    Write-Host "服务已启动，健康检查：$($r.Content)" -ForegroundColor Green
} catch {
    Write-Host "服务已安装，但健康检查失败：$($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "可查看日志：$root\backend\data\uvicorn.log"
}

Read-Host "按回车退出"
