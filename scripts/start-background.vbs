Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strDir = fso.GetParentFolderName(WScript.ScriptFullName)
strRoot = fso.GetParentFolderName(strDir)
WshShell.CurrentDirectory = strRoot
WshShell.Run "cmd /c npm run dev:server", 0, False
