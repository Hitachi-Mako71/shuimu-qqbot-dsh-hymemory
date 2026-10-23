param([string]$ProjectDir=$PSScriptRoot)
$ErrorActionPreference='Stop'
$record=Join-Path $ProjectDir 'data\chatgpt-chat\managed-server.private.json'
if(-not(Test-Path -LiteralPath $record)){return}
$entry=Get-Content -LiteralPath $record -Raw -Encoding UTF8|ConvertFrom-Json
$process=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$entry.pid) -ErrorAction SilentlyContinue
if($process -and $process.Name -eq 'node.exe' -and $process.CommandLine.Contains([string]$entry.script) -and $process.CommandLine.Contains([string]$entry.directory)){
    & taskkill.exe /PID ([int]$entry.pid) /T /F|Out-Null
    if($LASTEXITCODE -ne 0){throw 'Could not stop the managed Chat UI bridge'}
}
Remove-Item -LiteralPath $record -Force
