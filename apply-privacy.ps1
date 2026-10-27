param([string]$ProjectDir=$PSScriptRoot)
$ErrorActionPreference='Stop'
$ProjectDir=(Resolve-Path -LiteralPath $ProjectDir).Path
if($ProjectDir -ne $PSScriptRoot){throw 'Privacy worker must run from its installed project'}
$mutex=New-Object Threading.Mutex($false,'Local\ShuimuQQBotDesktopControl')
$acquired=$false;$resume=$false
try{
    try{$acquired=$mutex.WaitOne(30000)}catch [Threading.AbandonedMutexException]{$acquired=$true}
    if(-not $acquired){exit 3}
    $record=Join-Path $ProjectDir '.run/services.json'
    $resume=Test-Path -LiteralPath $record
    if($resume){& (Join-Path $ProjectDir 'stop-all.ps1') -KeepHindsight|Out-Null}
    . (Join-Path $ProjectDir 'import-local-config.ps1')
    Import-QqLocalConfig $ProjectDir
    & (Join-Path $ProjectDir '.venv/Scripts/python.exe') -X utf8 (Join-Path $ProjectDir 'memory_lifecycle.py') --project $ProjectDir --dsh-home $env:DSH_HOME
    if($LASTEXITCODE -ne 0){throw 'Privacy cleanup remains pending; memory reads stay blocked for affected identities'}
}finally{
    try{if($resume){& (Join-Path $ProjectDir 'start-all.ps1')|Out-Null}}
    finally{if($acquired){$mutex.ReleaseMutex()};$mutex.Dispose()}
}
