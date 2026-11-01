param(
    [string]$ProjectDir=$PSScriptRoot,
    [string]$SourceRepo=$PSScriptRoot,
    [string]$QqProfileDir=$(if($env:DSH_HOME){Join-Path $env:DSH_HOME 'profiles\qqbot'}else{'D:\DeepSeekHarnessData\home\profiles\qqbot'}),
    [string]$ResultPath,
    [switch]$RestoreCheck
)
$ErrorActionPreference='Stop'
$ProjectDir=[IO.Path]::GetFullPath($ProjectDir)
$SourceRepo=[IO.Path]::GetFullPath($SourceRepo)
$python=Join-Path $ProjectDir '.venv\Scripts\python.exe'
$tool=Join-Path $ProjectDir 'baseline_snapshot.py'
$mutex=New-Object Threading.Mutex($false,'Local\ShuimuQQBotDesktopControl')
$acquired=$false;$restoreQQ=$false;$restoreMemory=$false;$inspector=$null;$summary=$null
$stamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8)
$privateRoot=Join-Path $ProjectDir '.run\baselines'
$destination=Join-Path $privateRoot $stamp
$recovery=Join-Path $ProjectDir ('.run\baseline-restores\'+$stamp)
function Start-HiddenScript([string]$Script){
    # The WMI parent is independent of an API/tool execution job. Hidden child
    # launchers remain alive after this wrapper or controller worker exits.
    $startup=New-CimInstance -CimClass (Get-CimClass Win32_ProcessStartup) -ClientOnly -Property @{ShowWindow=[uint16]0}
    $launched=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "'+$Script+'"');CurrentDirectory=$ProjectDir;ProcessStartupInformation=$startup}
    if($launched.ReturnValue -ne 0){throw 'Could not restart managed services.'}
    return [int]$launched.ProcessId
}
try{
    try{$acquired=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$acquired=$true}
    if(-not $acquired){throw 'A robot configuration or service operation is still running.'}
    $stateFile=Join-Path $ProjectDir '.run\services.json'
    if(Test-Path -LiteralPath $stateFile){
        $state=Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8|ConvertFrom-Json
        foreach($name in @('qqbot','memory')){
            $entry=$state.$name
            if(-not $entry){continue}
            $expected=Join-Path $ProjectDir ('start-'+$name+'.ps1')
            if([string]$entry.script -ne $expected){throw 'Managed service path does not match this project.'}
            $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$entry.pid) -ErrorAction Stop
            if($process -and $process.CommandLine.Contains($expected)){
                if($name -eq 'qqbot'){$restoreQQ=$true}else{$restoreMemory=$true}
            }
        }
        & (Join-Path $ProjectDir 'stop-all.ps1') -KeepHindsight|Out-Null
    }
    & $python -X utf8 $tool capture --project $ProjectDir --profile $QqProfileDir --repo $SourceRepo --qq-state (Join-Path $env:USERPROFILE '.dsh-qqbot') --destination $destination | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Complete baseline snapshot was not created. Partial copies are not usable backups.'}
    $summaryFile=Join-Path $destination 'summary.private.json'
    & $python -X utf8 $tool verify --snapshot $destination --result $summaryFile|Out-Null
    if($LASTEXITCODE -ne 0){throw 'Baseline checksums did not verify.'}
    $summary=Get-Content -LiteralPath $summaryFile -Raw -Encoding UTF8|ConvertFrom-Json
    $summary|Add-Member -NotePropertyName isolatedRestoreVerified -NotePropertyValue $false
    if($RestoreCheck){
        & $python -X utf8 $tool restore-isolated --snapshot $destination --destination $recovery --privacy-ledger (Join-Path $ProjectDir '.privacy/lifecycle.sqlite3')|Out-Null
        if($LASTEXITCODE -ne 0){throw 'Isolated recovery did not match the baseline.'}
        $readyFile=Join-Path $recovery 'inspection-ready.private.json'
        $inspector=Start-Process -FilePath $python -ArgumentList @('-X','utf8',('"'+$tool+'"'),'serve-isolated','--destination',('"'+$recovery+'"'),'--ready-file',('"'+$readyFile+'"')) -WindowStyle Hidden -PassThru
        $deadline=[DateTime]::UtcNow.AddSeconds(15)
        while(-not(Test-Path -LiteralPath $readyFile) -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 150}
        if(-not(Test-Path -LiteralPath $readyFile)){throw 'Readonly recovery inspection server did not start.'}
        $ready=Get-Content -LiteralPath $readyFile -Raw -Encoding UTF8|ConvertFrom-Json
        $health=Invoke-RestMethod ('http://127.0.0.1:'+[int]$ready.port+'/health') -TimeoutSec 5
        if(-not($health.ok -and $health.readOnly -and $health.outboundDisabled -and $health.sourceDatabaseCountsVerified -and $health.sourceFileHashesVerified -and $health.deletionManifestApplied)){throw 'Recovery inspection was not ready.'}
        $summary.isolatedRestoreVerified=$true
        $summary|Add-Member -NotePropertyName recoveryPath -NotePropertyValue $recovery
    }
}finally{
    try{
        if($inspector -and -not $inspector.HasExited){$inspector.Kill();$inspector.WaitForExit()}
        # Preserve which services were running. Neither restored launchers nor
        # copied configuration/PIDs are executed. Resume the original project.
        if($restoreQQ -and $restoreMemory){Start-HiddenScript (Join-Path $ProjectDir 'start-all.ps1')|Out-Null}
        elseif($restoreQQ -or $restoreMemory){
            $single=if($restoreQQ){'start-qqbot.ps1'}else{'start-memory.ps1'}
            $childPid=Start-HiddenScript (Join-Path $ProjectDir $single)
            $name=if($restoreQQ){'qqbot'}else{'memory'}
            $resumed=@{};$resumed[$name]=@{pid=$childPid;script=(Join-Path $ProjectDir $single)}
            $resumed|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $ProjectDir '.run\services.json') -Encoding UTF8
        }
    }finally{if($acquired){$mutex.ReleaseMutex()};$mutex.Dispose()}
}
if($ResultPath){[IO.File]::WriteAllText($ResultPath,($summary|ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))}
$summary|ConvertTo-Json -Depth 8
