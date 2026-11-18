' ============================================================
'  作业提醒后端 - 静默后台启动
'  由「启动」文件夹里的快捷方式在登录时调用，也可以双击运行。
'  已经在运行时不会重复启动（避免抢端口）。
' ============================================================
Option Explicit

Dim fso, sh, baseDir, cmdFile, portBusy

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

baseDir  = fso.GetParentFolderName(WScript.ScriptFullName)
cmdFile = baseDir & "\start-backend.cmd"

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