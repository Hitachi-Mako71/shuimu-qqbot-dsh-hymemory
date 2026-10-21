param([string]$OutputFile,[string]$Namespace,[switch]$IncludeTestData)
$ErrorActionPreference='Stop'
$ProjectDir=Split-Path -Parent $MyInvocation.MyCommand.Path
if(-not $OutputFile){
    $Now=[TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow,'China Standard Time')
    $OutputFile=Join-Path $ProjectDir ('exports\shuimu-memory-'+$Now.ToString('yyyyMMdd-HHmmss-fff')+'.json')
}
$OutputFile=[IO.Path]::GetFullPath($OutputFile)
if(Test-Path -LiteralPath $OutputFile){throw 'The output already exists. Choose a new filename.'}
$Mutex=[Threading.Mutex]::new($false,'Local\ShuimuQQBotDesktopControl')
$Acquired=$false
$WasRunning=$false
try {
    try{$Acquired=$Mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$Acquired=$true}
    if(-not $Acquired){throw 'A desktop start/stop operation is still running. Try again shortly.'}
    $StateFile=Join-Path $ProjectDir '.run\services.json'
    if(Test-Path -LiteralPath $StateFile){
        $State=Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
        foreach($Name in @('qqbot','memory')){
            $Entry=$State.$Name
            if(-not $Entry){continue}
            $Process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$Entry.pid) -ErrorAction SilentlyContinue
            if($Process -and $Process.CommandLine.Contains([string]$Entry.script)){$WasRunning=$true}
        }
        & (Join-Path $ProjectDir 'stop-all.ps1') | Out-Null
    }
    $Arguments=@((Join-Path $ProjectDir 'export_memories.py'),'--project',$ProjectDir,'--output',$OutputFile)
    if($Namespace){$Arguments+=@('--namespace',$Namespace)}
    if($IncludeTestData){$Arguments+='--include-test-data'}
    & (Join-Path $ProjectDir '.venv\Scripts\python.exe') @Arguments
    if($LASTEXITCODE -ne 0){throw 'Memory JSON export failed.'}
    $Account=[Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $OutputFile /inheritance:r /grant:r ($Account+':F') 'SYSTEM:F' | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Export created, but local file permissions could not be restricted.'}
} finally {
    try{if($WasRunning){& (Join-Path $ProjectDir 'start-all.ps1') | Out-Null}}
    finally{if($Acquired){$Mutex.ReleaseMutex()};$Mutex.Dispose()}
}
