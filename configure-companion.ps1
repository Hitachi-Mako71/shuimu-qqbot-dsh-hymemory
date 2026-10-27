param([ValidateSet('High','Normal','Light')][string]$Frequency='High',[switch]$Pause,[switch]$ProbeNow)
$ErrorActionPreference='Stop'
$Project=Split-Path -Parent $MyInvocation.MyCommand.Path
$Directory=Join-Path $Project 'data\companion'
New-Item -ItemType Directory -Force -Path $Directory,(Join-Path $Directory 'control') | Out-Null
$Account=[Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $Directory /inheritance:r /grant:r ($Account+':(OI)(CI)F') 'SYSTEM:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Could not protect companion state permissions.'}
$Range=switch($Frequency){'High'{@(20,30,3)}'Normal'{@(60,120,1)}'Light'{@(180,360,1)}}
$SettingsPath=Join-Path $Directory 'settings.json'
$Existing=$null
if(Test-Path -LiteralPath $SettingsPath){$Existing=Get-Content -LiteralPath $SettingsPath -Raw -Encoding UTF8|ConvertFrom-Json}
$Owner='';$Target=$null
if($Existing){$Owner=[string]$Existing.owner;$Target=$Existing.target}
$Settings=[ordered]@{
 enabled=(-not $Pause)
 owner=$Owner
 target=$Target
 minMinutes=$Range[0]
 maxMinutes=$Range[1]
 hourlyMax=$Range[2]
 dailyMax=42
 quietStart=23
 quietEnd=9
 quietDisabled=$false
 timezone='Asia/Shanghai'
 snoozeUntil=0
}
if(-not $Settings.owner){
 $Bytes=New-Object byte[] 5
 $Rng=[Security.Cryptography.RandomNumberGenerator]::Create()
 try{$Rng.GetBytes($Bytes)}finally{$Rng.Dispose()}
 $Code=([BitConverter]::ToString($Bytes)).Replace('-','')
 $Sha=[Security.Cryptography.SHA256]::Create()
 try{$Settings.pairingHash=([BitConverter]::ToString($Sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Code)))).Replace('-','').ToLowerInvariant()}finally{$Sha.Dispose()}
 $Settings.pairingExpiresAt=[DateTimeOffset]::UtcNow.AddMinutes(15).ToUnixTimeMilliseconds()
 Write-Host ('PAIR_COMMAND=开启陪伴 '+$Code)
 Write-Host 'Send the pairing command in your private QQ chat within 15 minutes.'
}
$Utf8=New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText(($SettingsPath+'.tmp'),($Settings|ConvertTo-Json -Depth 5),$Utf8)
Move-Item -LiteralPath ($SettingsPath+'.tmp') -Destination $SettingsPath -Force
if($ProbeNow){
 $ActionId=[Guid]::NewGuid().ToString()
 $Action=@{type='proactive_probe';createdAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
 [IO.File]::WriteAllText((Join-Path $Directory ('control\'+$ActionId+'.json')),($Action|ConvertTo-Json),$Utf8)
 Write-Host ('PROACTIVE_RECEIPT_FILE='+$ActionId+'.json')
}
Write-Host 'Companion configured for the paired private owner. Only lightweight greetings remain; reading, fictional daily life and generated memories are removed.'
Write-Host 'High frequency considers sharing every 20-30 minutes, at most 3 successful pushes per hour; 23:00-09:00 is quiet.'
