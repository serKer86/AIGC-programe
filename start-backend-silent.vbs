' ============================================================
'  作业提醒后端 - 静默启动 / 守护
'  - 由「任务计划程序」每 2 分钟调用一次（登录后自动触发）
'  - 也可以在需要时双击手动启动
'  - 健康检查用 HTTP 探测，不启动任何子进程（避免每 2 分钟闪一下窗口）
'  - 已经在运行时不重复启动，只在真正拉起时写一行日志
' ============================================================
Option Explicit

Dim fso, sh, baseDir, cmdFile, logFile, stream, stamp

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

baseDir  = fso.GetParentFolderName(WScript.ScriptFullName)
cmdFile  = baseDir & "\start-backend.cmd"
logFile  = baseDir & "\backend\data\watchdog.log"

If Not fso.FileExists(cmdFile) Then WScript.Quit 1

' 1) 直接请求 /api/health 判断后端是否存活（不产生任何窗口）
Function BackendAlive()
  Dim http
  BackendAlive = False

  On Error Resume Next
  Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
  If Err.Number <> 0 Then
    Err.Clear
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  End If
  If Err.Number <> 0 Then
    Err.Clear
    Exit Function
  End If

  http.SetTimeouts 2000, 2000, 2000, 2000
  http.Open "GET", "http://127.0.0.1:8000/api/health", False
  http.Send
  If Err.Number = 0 Then
    If http.Status = 200 Then BackendAlive = True
  End If
  Err.Clear
  On Error GoTo 0
End Function

If BackendAlive() Then WScript.Quit 0

' 2) 后端未响应：隐藏窗口启动（0 = 不显示窗口，False = 不等待退出）
sh.CurrentDirectory = baseDir
sh.Run "cmd /c """ & cmdFile & """ -silent", 0, False

' 3) 记录一次启动（仅在实际拉起时写，避免日志刷屏）
On Error Resume Next
stamp = Year(Now) & "-" & Right("0" & Month(Now), 2) & "-" & Right("0" & Day(Now), 2) & " " & _
        Right("0" & Hour(Now), 2) & ":" & Right("0" & Minute(Now), 2) & ":" & Right("0" & Second(Now), 2)
Set stream = fso.OpenTextFile(logFile, 8, True)
stream.WriteLine stamp & "  watchdog: starting backend"
stream.Close
On Error GoTo 0