$ErrorActionPreference = 'Stop'
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ProjectDir 'import-local-config.ps1')
Import-QqLocalConfig $ProjectDir
$env:QQBOT_CODEX_RELAY_DIR=Join-Path $ProjectDir 'data\codex-relay'
# Node 24 does not use Windows' system proxy automatically. Apply it to this
# process tree so both fetch and the QQ HTTPS/WebSocket transport can connect.
$ProbeUri=[Uri]'https://api.bot.qq.com'
$SystemProxy=[Net.WebRequest]::DefaultWebProxy.GetProxy($ProbeUri)
if($SystemProxy -and $SystemProxy -ne $ProbeUri){
    if(-not $env:HTTPS_PROXY){$env:HTTPS_PROXY=$SystemProxy.AbsoluteUri}
    if(-not $env:HTTP_PROXY){$env:HTTP_PROXY=$SystemProxy.AbsoluteUri}
}
if($env:HTTPS_PROXY -or $env:HTTP_PROXY){
    $env:NODE_USE_ENV_PROXY='1'
    $env:NO_PROXY=(@($env:NO_PROXY,'localhost','127.0.0.1','::1') | Where-Object {$_}) -join ','
}
if(-not $env:QQBOT_APPID -or -not $env:QQBOT_SECRET){throw 'Use configure-qq-local.ps1 to verify and save QQ credentials first.'}
Set-Location $ProjectDir
& node (Join-Path $ProjectDir 'runtime\node_modules\@deepseek-ai\dsh\lib\bin.js') --profile qqbot
