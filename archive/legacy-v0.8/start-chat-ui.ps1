param([string]$ProjectDir=$PSScriptRoot)
$ErrorActionPreference='Stop'
$directory=Join-Path $ProjectDir 'data\chatgpt-chat'
$null=New-Item -ItemType Directory -Force -Path $directory,(Join-Path $ProjectDir 'logs'),(Join-Path $ProjectDir 'data\memory-workspace\chat-work-output')
$account=[Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $directory /inheritance:r /grant:r ($account+':(OI)(CI)F') 'SYSTEM:(OI)(CI)F'|Out-Null
if($LASTEXITCODE -ne 0){throw 'Could not protect Chat UI connection settings'}
try{$health=Invoke-RestMethod 'http://127.0.0.1:8767/health' -TimeoutSec 1;if($health.service -eq 'yuzu-chat-ui'){return}}catch{}
$dshHome=if($env:DSH_HOME){$env:DSH_HOME}else{'D:\DeepSeekHarnessData\home'}
$cli=Join-Path $dshHome 'profiles\qqbot\node_modules\dsh-chatgpt-plan\chat-ui-cli.js'
if(-not(Test-Path -LiteralPath $cli)){throw 'Install the Chat UI provider package first'}
$node=(Get-Command node -ErrorAction Stop).Source
$arguments=@(('"'+$cli+'"'),'serve','--directory',('"'+$directory+'"'))
$process=Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $ProjectDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $ProjectDir 'logs\chat-ui.out.log') -RedirectStandardError (Join-Path $ProjectDir 'logs\chat-ui.err.log') -PassThru
$record=@{pid=$process.Id;script=$cli;directory=$directory}
[IO.File]::WriteAllText((Join-Path $directory 'managed-server.private.json'),($record|ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))
for($i=0;$i -lt 40;$i++){try{$health=Invoke-RestMethod 'http://127.0.0.1:8767/health' -TimeoutSec 1;if($health.service -eq 'yuzu-chat-ui'){Write-Output 'Chat UI loopback bridge ready';return}}catch{};Start-Sleep -Milliseconds 150}
throw 'Chat UI loopback bridge did not start; check the local error log'
