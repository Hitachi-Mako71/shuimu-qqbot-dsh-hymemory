param([string]$ProjectDir=$PSScriptRoot)
$ErrorActionPreference='Stop'
$privateDir=Join-Path $ProjectDir 'data\chatgpt-plan'
New-Item -ItemType Directory -Path $privateDir -Force|Out-Null
$account=[Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $privateDir /inheritance:r /grant:r ($account+':(OI)(CI)F') 'SYSTEM:(OI)(CI)F'|Out-Null
if($LASTEXITCODE -ne 0){throw 'Unable to protect local ChatGPT credentials.'}
$dshHome=if($env:DSH_HOME){$env:DSH_HOME}else{'D:\DeepSeekHarnessData\home'}
$scriptPath=Join-Path $dshHome 'profiles\qqbot\node_modules\dsh-chatgpt-plan\cli.js'
if(-not(Test-Path -LiteralPath $scriptPath)){throw 'Install the local ChatGPT provider into the qqbot profile first.'}
$record=Join-Path $privateDir 'login-process.json'
if(Test-Path -LiteralPath $record){
    $old=Get-Content -LiteralPath $record -Raw -Encoding UTF8|ConvertFrom-Json
    $running=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$old.pid) -ErrorAction SilentlyContinue
    if($running -and $running.CommandLine -and $running.CommandLine.Contains($scriptPath)){Write-Output 'CHATGPT_LOGIN_ALREADY_RUNNING';exit 0}
}
$probe=[Uri]'https://auth.openai.com'
$proxy=[Net.WebRequest]::DefaultWebProxy.GetProxy($probe)
if($proxy -and $proxy -ne $probe){if(-not $env:HTTPS_PROXY){$env:HTTPS_PROXY=$proxy.AbsoluteUri};if(-not $env:HTTP_PROXY){$env:HTTP_PROXY=$proxy.AbsoluteUri}}
if($env:HTTPS_PROXY -or $env:HTTP_PROXY){$env:NODE_USE_ENV_PROXY='1';$env:NO_PROXY='localhost,127.0.0.1,::1'}
$node=(Get-Command node.exe -ErrorAction Stop).Source
$arguments=@(('"'+$scriptPath+'"'),'login','--directory',('"'+$privateDir+'"'))
$process=Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $ProjectDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $privateDir 'login-result.private.txt') -RedirectStandardError (Join-Path $privateDir 'login-error.private.txt') -PassThru
[IO.File]::WriteAllText($record,(@{pid=$process.Id}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
Write-Output 'CHATGPT_LOGIN_BROWSER_OPENING'
