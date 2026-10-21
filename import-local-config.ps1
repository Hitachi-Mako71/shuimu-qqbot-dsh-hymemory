function Import-QqLocalConfig([string]$ProjectDir) {
    $envPath=Join-Path $ProjectDir '.env'
    if(-not(Test-Path $envPath)){throw 'Missing local .env. Run install-qqbot.ps1 first.'}
    Get-Content -LiteralPath $envPath -Encoding UTF8 | ForEach-Object {
        $line=$_.Trim()
        if($line -and -not $line.StartsWith('#') -and $line.Contains('=')){
            $parts=$line.Split('=',2)
            [Environment]::SetEnvironmentVariable($parts[0].Trim(),$parts[1].Trim(),'Process')
        }
    }
    if(-not $env:MEMORY_BRIDGE_TOKEN){throw 'Missing local memory bridge token.'}
    $credentialPath=Join-Path $ProjectDir 'qq.credentials.json'
    if(Test-Path $credentialPath){
        $credentials=Get-Content -Raw -Encoding UTF8 -LiteralPath $credentialPath|ConvertFrom-Json
        $env:QQBOT_APPID=$credentials.appId
        $env:QQBOT_SECRET=$credentials.appSecret
    }
    $env:QQBOT_TOKEN_BASE_URL='https://bots.qq.com'
    if(-not $env:DSH_HOME){$env:DSH_HOME='D:\DeepSeekHarnessData\home'}
}
