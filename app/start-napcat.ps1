$ErrorActionPreference='Stop'
$project=$PSScriptRoot
$file=Join-Path $project 'data/transport/onebot.json'
if(-not(Test-Path -LiteralPath $file)){return}
$cfg=Get-Content -LiteralPath $file -Raw -Encoding UTF8|ConvertFrom-Json
if($cfg.mode -ne 'onebot'){return}
$root=[IO.Path]::GetFullPath([string]$cfg.napcatRoot)
$allowed=[IO.Path]::GetFullPath((Join-Path $project 'runtime/napcat'))+[IO.Path]::DirectorySeparatorChar
if(-not $root.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)){throw 'NapCat path is outside this project'}
$recordFile=Join-Path $project '.run/napcat-launch.private.json'
if(Test-Path -LiteralPath $recordFile){
    $record=Get-Content -LiteralPath $recordFile -Raw|ConvertFrom-Json
    $running=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$record.pid) -ErrorAction SilentlyContinue
    if($running -and $running.ExecutablePath -eq (Join-Path $root 'NapCatWinBootMain.exe') -and $running.CommandLine.Contains([string]$cfg.qqExecutable)){return}
}
if(-not(Test-Path -LiteralPath $cfg.qqExecutable)){throw 'The configured QQ executable is missing'}
$env:NAPCAT_PATCH_PACKAGE=Join-Path $root 'qqnt.json'
$env:NAPCAT_LOAD_PATH=Join-Path $root 'loadNapCat.js'
$env:NAPCAT_INJECT_PATH=Join-Path $root 'NapCatWinBootHook.dll'
$env:NAPCAT_LAUNCHER_PATH=Join-Path $root 'NapCatWinBootMain.exe'
$env:NAPCAT_MAIN_PATH=Join-Path $root 'napcat.mjs'
$process=Start-Process -FilePath $env:NAPCAT_LAUNCHER_PATH -ArgumentList @(('"'+$cfg.qqExecutable+'"'),('"'+$env:NAPCAT_INJECT_PATH+'"'),'-q',[string]$cfg.selfId) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $project 'logs/napcat.out.log') -RedirectStandardError (Join-Path $project 'logs/napcat.err.log') -PassThru
@{pid=$process.Id;executable=$env:NAPCAT_LAUNCHER_PATH;launchedAt=[DateTime]::UtcNow.ToString('o');qqExecutable=[string]$cfg.qqExecutable}|ConvertTo-Json|Set-Content -LiteralPath $recordFile -Encoding UTF8
