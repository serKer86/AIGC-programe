' ============================================================
'  作业提醒后端 - 静默后台启动 / 守护
'  - 由「任务计划程序」每 2 分钟调用一次（登录后自动触发）
'  - 也可以在需要时双击手动启动
'  - 已经在运行时不重复启动（避免抢端口），启动时写一行日志
' ============================================================
Option Explicit

Dim fso, sh, baseDir, cmdFile, portBusy, logFile, stream, stamp

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

baseDir  = fso.GetParentFolderName(WScript.ScriptFullName)
cmdFile  = baseDir & "\start-backend.cmd"
logFile  = baseDir & "\backend\data\watchdog.log"

If Not fso.FileExists(cmdFile) Then WScript.Quit 1

' 1) 用 netstat 判断 8000 端口是否已被本机后端占用
portBusy = False
On Error Resume Next
Dim exec, output, re
Set exec = sh.Exec("cmd /c netstat -ano -p TCP")
output = LCase(exec.StdOut.ReadAll)
Set re = New RegExp
re.Pattern = "127\.0\.0\.1:8000\s+\S+\s+listening"
If re.Test(output) Then portBusy = True
On Error GoTo 0

If portBusy Then WScript.Quit 0

' 2) 隐藏窗口启动（0 = 不显示窗口，False = 不等待退出）
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