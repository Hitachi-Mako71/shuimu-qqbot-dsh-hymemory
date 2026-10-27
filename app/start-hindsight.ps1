$ErrorActionPreference='Stop'
$project=$PSScriptRoot
$pidFile=Join-Path $project '.run/hindsight.pid'
$script=Join-Path $project 'hindsight_runtime.py'
if(Test-Path -LiteralPath $pidFile){
    $recorded=Get-Content -LiteralPath $pidFile -Raw
    $existing=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$recorded) -ErrorAction SilentlyContinue
    if($existing -and $existing.CommandLine.Contains($script)){return}
}
$python=Join-Path $project 'hindsight/.venv/Scripts/python.exe'
if(-not(Test-Path -LiteralPath $python)){throw 'Hindsight environment has not been installed'}
$args=@(('"'+$script+'"'),'--project',('"'+$project+'"'))
$process=Start-Process -FilePath $python -ArgumentList $args -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput (Join-Path $project 'logs/hindsight.out.log') -RedirectStandardError (Join-Path $project 'logs/hindsight.err.log') -PassThru
$process.Id|Set-Content -LiteralPath $pidFile -Encoding ASCII
