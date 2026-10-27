param(
    [string]$ThreadId = $env:CODEX_THREAD_ID,
    [string]$RolloutPath,
    [switch]$Rebind
)
$ErrorActionPreference = 'Stop'
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if($ThreadId -notmatch '^[0-9a-f-]{36}$'){throw 'Provide the existing Codex chat UUID using -ThreadId.'}
$CodexPath = (Get-Command codex.exe -ErrorAction Stop).Source
$CodexData = if($env:CODEX_HOME){$env:CODEX_HOME}else{Join-Path $env:USERPROFILE '.codex'}
if(-not $RolloutPath){
    $RolloutMatches = @(Get-ChildItem -LiteralPath (Join-Path $CodexData 'sessions') -Filter ('*'+$ThreadId+'.jsonl') -File -Recurse)
    if($RolloutMatches.Count -ne 1){throw 'Expected exactly one matching Codex chat record. Provide -RolloutPath explicitly.'}
    $RolloutPath = $RolloutMatches[0].FullName
}
$RolloutPath = (Resolve-Path -LiteralPath $RolloutPath).Path
if(-not ([IO.Path]::GetFileName($RolloutPath).EndsWith($ThreadId+'.jsonl'))){throw 'The record does not belong to the requested chat.'}
$RelayDir = Join-Path $ProjectDir 'data\codex-relay'
New-Item -ItemType Directory -Force -Path $RelayDir | Out-Null
$Account = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $RelayDir /inheritance:r /grant:r ($Account+':(OI)(CI)F') 'SYSTEM:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Could not protect the local relay directory.'}
$StatePath = Join-Path $RelayDir 'state.json'
if(Test-Path -LiteralPath $StatePath){
    $Existing = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if($Existing.threadId -and $Existing.threadId -ne $ThreadId -and -not $Rebind){throw 'Another chat is bound. Use -Rebind only to replace that binding.'}
    if($Rebind){
        # Stop the bot before replacing an existing private identity binding.
        if(Test-Path (Join-Path $ProjectDir '.run\services.json')){throw 'Stop the bot before using -Rebind.'}
        Remove-Item -LiteralPath $StatePath
    }
}
$RandomBytes = New-Object byte[] 5
$Rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try{$Rng.GetBytes($RandomBytes)}finally{$Rng.Dispose()}
$Code = ([BitConverter]::ToString($RandomBytes)).Replace('-','')
$Sha = [Security.Cryptography.SHA256]::Create()
try{$Digest=([BitConverter]::ToString($Sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Code)))).Replace('-','').ToLowerInvariant()}finally{$Sha.Dispose()}
$Config = [ordered]@{
    threadId=$ThreadId
    rollout=$RolloutPath
    codexPath=$CodexPath
    pairingHash=$Digest
    pairingExpiresAt=[DateTimeOffset]::UtcNow.AddMinutes(15).ToUnixTimeMilliseconds()
}
$ConfigPath = Join-Path $RelayDir 'config.json'
$Utf8 = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText(($ConfigPath+'.tmp'),($Config | ConvertTo-Json),$Utf8)
Move-Item -LiteralPath ($ConfigPath+'.tmp') -Destination $ConfigPath -Force
Write-Host ('PAIR_COMMAND=开启Codex同步 '+$Code)
Write-Host 'Pairing code expires in 15 minutes. Send this command in your private QQ chat with Shuimu.'
Write-Host 'Only new public assistant progress/replies from this one Codex chat will be forwarded.'
