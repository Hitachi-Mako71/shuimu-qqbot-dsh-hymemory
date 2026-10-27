$project=Split-Path -Parent $MyInvocation.MyCommand.Path
$file=Join-Path $project '.run\services.json'
if(-not(Test-Path $file)){Write-Host 'No managed memory service recorded.';exit 0}
$entry=(Get-Content $file -Raw|ConvertFrom-Json).memory
if($entry){
    $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$entry.pid) -ErrorAction SilentlyContinue
    if($process -and $process.CommandLine.Contains([string]$entry.script)){
        & taskkill.exe /PID $entry.pid /T /F | Out-Null
    }
}
