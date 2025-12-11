Set WshShell = CreateObject("WScript.Shell")
DesktopPath = WshShell.SpecialFolders("Desktop")
Set ShortcutLink = WshShell.CreateShortcut(DesktopPath & "\Ququ.lnk")
ShortcutLink.TargetPath = WshShell.CurrentDirectory & "\start-ququ-hidden.vbs"
ShortcutLink.WorkingDirectory = WshShell.CurrentDirectory
ShortcutLink.IconLocation = WshShell.CurrentDirectory & "\assets\icon.ico"
ShortcutLink.Description = "Ququ Development Environment"
ShortcutLink.Save
MsgBox "Desktop shortcut 'Ququ' created successfully!", vbInformation, "Success"

