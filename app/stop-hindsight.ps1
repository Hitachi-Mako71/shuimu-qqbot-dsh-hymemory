$ErrorActionPreference='Stop'
$project=$PSScriptRoot
$pidFile=Join-Path $project '.run/hindsight.pid'
if(Test-Path -LiteralPath $pidFile){
    $recorded=Get-Content -LiteralPath $pidFile -Raw
    $existing=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$recorded) -ErrorAction SilentlyContinue
    if($existing -and $existing.CommandLine.Contains((Join-Path $project 'hindsight_runtime.py'))){
        & taskkill.exe /PID $existing.ProcessId /T /F | Out-Null
    }
    Remove-Item -LiteralPath $pidFile -Force
}
& (Join-Path $project 'hindsight/.venv/Scripts/python.exe') -X utf8 -c "from pg0 import Pg0; p=Pg0(name='yuzu-hindsight'); i=p.info(); p.stop() if i and i.running else None"
if($LASTEXITCODE -ne 0){throw 'Managed Hindsight database stop needs attention'}
