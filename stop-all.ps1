$ErrorActionPreference='Stop'
$project=Split-Path -Parent $MyInvocation.MyCommand.Path
$file=Join-Path $project '.run\services.json'
if(-not(Test-Path $file)){Write-Host 'No managed services recorded.';exit 0}
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
Write-Host 'Stopped the managed QQ/DSH and Hy Memory process trees.'
