param([string]$DesktopDir = [Environment]::GetFolderPath('Desktop'))
$ErrorActionPreference = 'Stop'
$Project = Split-Path -Parent $MyInvocation.MyCommand.Path
$Control = Join-Path $Project 'robot-control.ps1'
$PowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$Icon = Join-Path $Project 'launcher-icons\start.ico'
if (-not (Test-Path -LiteralPath $Control)) { throw 'Missing robot-control.ps1' }
if (-not (Test-Path -LiteralPath $Icon)) { throw 'Missing launcher icon' }
if (-not (Test-Path -LiteralPath $DesktopDir -PathType Container)) { throw 'Desktop directory does not exist' }
$Shell = New-Object -ComObject WScript.Shell
$ShortcutPath = Join-Path $DesktopDir '柚柚机器人控制台.lnk'
if (Test-Path -LiteralPath $ShortcutPath) {
    $Existing = $Shell.CreateShortcut($ShortcutPath)
    if (-not $Existing.Arguments.Contains($Control)) { throw ('A different shortcut already uses this name: ' + $ShortcutPath) }
}
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $PowerShell
$Shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $Control + '"'
$Shortcut.WorkingDirectory = $Project
$Shortcut.WindowStyle = 7
$Shortcut.Description = '查看柚柚机器人状态、启停服务并管理常用设置'
$Shortcut.IconLocation = $Icon + ',0'
$Shortcut.Save()

# Remove only the two old shortcuts after verifying they point to this project's former controller.
foreach ($Name in @('启动水木机器人', '关闭水木机器人')) {
    $OldPath = Join-Path $DesktopDir ($Name + '.lnk')
    if (-not (Test-Path -LiteralPath $OldPath)) { continue }
    $Old = $Shell.CreateShortcut($OldPath)
    if ($Old.Arguments.Contains((Join-Path $Project 'desktop-control.ps1'))) {
        Remove-Item -LiteralPath $OldPath -Force
    } else {
        Write-Warning ('保留同名快捷方式，因为它指向其他目标：' + $OldPath)
    }
}
Write-Host ('Created: ' + $ShortcutPath)
