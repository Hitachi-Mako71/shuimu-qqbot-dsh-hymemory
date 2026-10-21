param([string]$DesktopDir=[Environment]::GetFolderPath('Desktop'))
$ErrorActionPreference='Stop'
$ProjectDir=Split-Path -Parent $MyInvocation.MyCommand.Path
$Controller=Join-Path $ProjectDir 'desktop-control.ps1'
$PowerShell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if(-not(Test-Path -LiteralPath $Controller)){throw 'Missing desktop-control.ps1'}
if(-not(Test-Path -LiteralPath $DesktopDir -PathType Container)){throw 'Desktop directory does not exist'}
$Shell=New-Object -ComObject WScript.Shell
$Items=@(
    @{Name='启动水木机器人';Action='Start';Icon='start.ico';Description='一键启动 QQ 机器人和长期记忆服务'},
    @{Name='关闭水木机器人';Action='Stop';Icon='stop.ico';Description='关闭机器人及记忆服务，保留聊天记录和长期记忆'}
)
foreach($Item in $Items){
    $Icon=Join-Path $ProjectDir ('launcher-icons\'+$Item.Icon)
    if(-not(Test-Path -LiteralPath $Icon)){throw 'Launcher icon missing'}
    $Path=Join-Path $DesktopDir ($Item.Name+'.lnk')
    if(Test-Path -LiteralPath $Path){
        $Existing=$Shell.CreateShortcut($Path)
        if(-not $Existing.Arguments.Contains($Controller)){throw ('A different shortcut already uses this name: '+$Path)}
    }
    $Shortcut=$Shell.CreateShortcut($Path)
    $Shortcut.TargetPath=$PowerShell
    $Shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$Controller+'" -Action '+$Item.Action
    $Shortcut.WorkingDirectory=$ProjectDir
    $Shortcut.WindowStyle=7
    $Shortcut.Description=$Item.Description
    $Shortcut.IconLocation=$Icon+',0'
    $Shortcut.Save()
    Write-Host ('Created: '+$Path)
}
