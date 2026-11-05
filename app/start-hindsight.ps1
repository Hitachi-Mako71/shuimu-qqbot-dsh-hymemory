$ErrorActionPreference='Stop'
$project=$PSScriptRoot
$pidFile=Join-Path $project '.run/hindsight.pid'
$script=Join-Path $project 'hindsight_runtime.py'
$python=Join-Path $project 'hindsight/.venv/Scripts/python.exe'
if(Test-Path -LiteralPath $pidFile){
    $recorded=Get-Content -LiteralPath $pidFile -Raw
    try{$existing=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$recorded) -ErrorAction Stop}
    catch{
        $recordedProcess=Get-Process -Id ([int]$recorded) -ErrorAction SilentlyContinue
        if($recordedProcess){
            $recordedPath=$recordedProcess.Path
            if(-not $recordedPath){throw 'HindsightProcessIdentityUnavailable'}
            if([IO.Path]::GetFullPath($recordedPath) -eq [IO.Path]::GetFullPath($python)){return}
        }
        $existing=$null
    }
    if($existing -and $existing.CommandLine.Contains($script)){return}
}
if(-not(Test-Path -LiteralPath $python)){throw 'Hindsight environment has not been installed'}
$args=@(('"'+$script+'"'),'--project',('"'+$project+'"'))
$process=Start-Process -FilePath $python -ArgumentList $args -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput (Join-Path $project 'logs/hindsight.out.log') -RedirectStandardError (Join-Path $project 'logs/hindsight.err.log') -PassThru
$process.Id|Set-Content -LiteralPath $pidFile -Encoding ASCII
