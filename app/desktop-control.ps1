param([Parameter(Mandatory=$true)][ValidateSet('Start','Stop')][string]$Action)
$ErrorActionPreference='Stop'
$ProjectDir=Split-Path -Parent $MyInvocation.MyCommand.Path
$Popup=New-Object -ComObject WScript.Shell
$Mutex=[Threading.Mutex]::new($false,'Local\ShuimuQQBotDesktopControl')
$Acquired=$false
try {
    try {$Acquired=$Mutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$Acquired=$true}
    if(-not $Acquired){
        $null=$Popup.Popup('正在处理上一次操作，请稍候。',3,'水木机器人',64)
        exit 0
    }
    Set-Location -LiteralPath $ProjectDir
    if($Action -eq 'Stop'){
        if(Test-Path -LiteralPath (Join-Path $ProjectDir '.run\services.json')){
            & (Join-Path $ProjectDir 'stop-all.ps1') | Out-Null
        }
        $null=$Popup.Popup('水木机器人和长期记忆服务已关闭。聊天记录与长期记忆已保留。',4,'水木机器人',64)
    } else {
        & (Join-Path $ProjectDir 'start-all.ps1') | Out-Null
        $Deadline=[DateTime]::UtcNow.AddSeconds(45)
        $Ready=$false
        do {
            try {
                $Log=Get-Content -LiteralPath (Join-Path $ProjectDir 'logs\qqbot.out.log') -Raw -ErrorAction SilentlyContinue
                $Health=Invoke-RestMethod 'http://127.0.0.1:8765/health' -TimeoutSec 2
                $Ready=($Log -match 'Bot ready!') -and $Health.sdk_ready -and $Health.embedding_ready
            } catch {}
            if(-not $Ready){Start-Sleep -Milliseconds 750}
        } while(-not $Ready -and [DateTime]::UtcNow -lt $Deadline)
        if($Ready){
            $null=$Popup.Popup('水木机器人已上线，长期记忆服务已就绪，可以在 QQ 聊天了。',4,'水木机器人',64)
        } else {
            $null=$Popup.Popup(('启动进程已创建，服务仍在连接。请稍后在 QQ 尝试；如未上线，请查看：'+(Join-Path $ProjectDir 'logs')),8,'水木机器人',48)
        }
    }
} catch {
    $null=$Popup.Popup(('操作未完成：'+$_.Exception.Message+"`r`n日志目录："+(Join-Path $ProjectDir 'logs')),0,'水木机器人',16)
    exit 1
} finally {
    if($Acquired){$Mutex.ReleaseMutex()}
    $Mutex.Dispose()
}
