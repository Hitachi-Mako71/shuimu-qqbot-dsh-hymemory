param([switch]$KeepHindsight)
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $MyInvocation.MyCommand.Path
$file=Join-Path $project '.run\services.json'
if(Test-Path -LiteralPath (Join-Path $project 'stop-napcat.ps1')){& (Join-Path $project 'stop-napcat.ps1')}
if(-not(Test-Path $file)){if(-not $KeepHindsight -and (Test-Path (Join-Path $project '.run/hindsight.pid'))){& (Join-Path $project 'stop-hindsight.ps1')};Write-Host 'No managed QQ services recorded.';return}
$services=Get-Content $file -Raw|ConvertFrom-Json
foreach($name in @('qqbot','memory')){
    $entry=$services.$name
    if(-not $entry){continue}
    $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$entry.pid) -ErrorAction SilentlyContinue
    if($process -and $process.CommandLine.Contains([string]$entry.script)){
        & taskkill.exe /PID $entry.pid /T /F | Out-Null
    }
}
Remove-Item -LiteralPath $file -Force
if(-not $KeepHindsight -and (Test-Path (Join-Path $project '.run/hindsight.pid'))){& (Join-Path $project 'stop-hindsight.ps1')}
Write-Host 'Stopped the managed QQ/DSH and Hy Memory process trees.'
