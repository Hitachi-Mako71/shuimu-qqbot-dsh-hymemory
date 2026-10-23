param(
    [Parameter(Mandatory=$true)][ValidateSet('Status','Snapshot','Start','Stop','Restart','SaveCompanion','SaveGroup','SavePersona','SaveStreaming','SaveModel','ConnectChatGPT','RefreshChatGPT','ProbeChatGPT','ConnectChatUI','ProbeChatUI','RefreshCodex','ProbeCodex','OpenCodex','SaveImages','ImageTasks','ImagePreview','ImageProbe','CancelImage','RetryImage','Logs','Backup','ExportMemory','ReadingStatus','ReadingImport','ReadingNext','ReadingAuto','ReadingExport')][string]$Action,
    [string]$ProjectDir = $PSScriptRoot,
    [string]$QqProfileDir = $(if($env:DSH_HOME){Join-Path $env:DSH_HOME 'profiles\qqbot'}else{'D:\DeepSeekHarnessData\home\profiles\qqbot'}),
    [string]$RequestPath,
    [Parameter(Mandatory=$true)][string]$ResultPath
)
$ErrorActionPreference='Stop'
$ProjectDir=[IO.Path]::GetFullPath($ProjectDir)
$jobRoot=[IO.Path]::GetFullPath((Join-Path $ProjectDir '.run\control-console\jobs'))
$ResultPath=[IO.Path]::GetFullPath($ResultPath)
if(-not $ResultPath.StartsWith($jobRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Result path must be in the private controller job directory'}
if($RequestPath){$RequestPath=[IO.Path]::GetFullPath($RequestPath);if(-not $RequestPath.StartsWith($jobRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid controller request path'}}
New-Item -ItemType Directory -Force -Path $jobRoot|Out-Null
function Write-ControllerJson([string]$Path,$Value){
    $temporary=$Path+'.tmp'
    [IO.File]::WriteAllText($temporary,($Value|ConvertTo-Json -Depth 30),(New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $temporary -Destination $Path -Force
}
function Progress-Stage([string]$Message){Write-ControllerJson ($ResultPath+'.progress') @{message=$Message}}
function Read-SharedLogPrefix([string]$Path){
    $stream=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    try{$reader=New-Object IO.StreamReader($stream,[Text.Encoding]::UTF8,$true);try{$buffer=New-Object char[] 65536;$count=$reader.ReadBlock($buffer,0,$buffer.Length);return (New-Object string($buffer,0,$count))}finally{$reader.Dispose()}}finally{$stream.Dispose()}
}
function Get-ControllerStatus{
    $record=Join-Path $ProjectDir '.run\services.json'
    $services=$null
    if(Test-Path -LiteralPath $record){try{$services=Get-Content -LiteralPath $record -Raw -Encoding UTF8|ConvertFrom-Json}catch{}}
    $pids=@{qqbot=0;memory=0};$unknown=@{qqbot=$false;memory=$false}
    foreach($name in @('qqbot','memory')){
        $entry=if($services){$services.$name}else{$null}
        if(-not $entry){continue}
        $expected=Join-Path $ProjectDir ('start-'+$name+'.ps1')
        if([string]$entry.script -ne $expected -or [int]$entry.pid -le 0){continue}
        try{$process=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$entry.pid) -ErrorAction Stop;if($process -and $process.CommandLine -and $process.CommandLine.Contains($expected)){$pids[$name]=[int]$process.ProcessId}}catch{$unknown[$name]=$true}
    }
    $health=$null
    try{$health=Invoke-RestMethod 'http://127.0.0.1:8765/health' -TimeoutSec 1}catch{}
    $ready=$false;$readable=$true
    if($pids.qqbot){try{$ready=(Read-SharedLogPrefix (Join-Path $ProjectDir 'logs\qqbot.out.log')).Contains('Bot ready!')}catch{$readable=$false}}
    $qqState=if($ready){'ready'}elseif($unknown.qqbot){'unknown'}elseif($pids.qqbot){'starting'}else{'stopped'}
    $memoryState=if($health -and $health.sdk_ready -and $health.embedding_ready){'ready'}elseif($health -or $pids.memory){'starting'}elseif($unknown.memory){'unknown'}else{'stopped'}
    $modelRoute=$null;$nativeRuntime=$null
    try{$modelRoute=Get-Content (Join-Path $ProjectDir 'data\model-routing.json') -Raw -Encoding UTF8|ConvertFrom-Json}catch{}
    try{$nativeRuntime=Get-Content (Join-Path $ProjectDir 'data\codex-work\runtime.json') -Raw -Encoding UTF8|ConvertFrom-Json}catch{}
    $zone=[TimeZoneInfo]::FindSystemTimeZoneById('China Standard Time')
    return @{qq=$qqState;memory=$memoryState;qqPid=$pids.qqbot;memoryPid=$pids.memory;logReadable=$readable;modelProvider=$modelRoute.provider;nativeRuntime=$nativeRuntime;restartRequired=(Test-Path (Join-Path $ProjectDir '.run\control-console\restart-required.json'));checkedAt=[TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow,$zone).ToString('HH:mm:ss')}
}
$operationMutex=$null;$acquired=$false
try{
    if($Action -eq 'Status'){$data=Get-ControllerStatus;$message='状态已更新'}
    elseif($Action -in @('Start','Stop','Restart')){
        $operationMutex=New-Object Threading.Mutex($false,'Local\ShuimuQQBotDesktopControl')
        try{$acquired=$operationMutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$acquired=$true}
        if(-not $acquired){throw '另一个启停或记忆导出操作正在进行，请稍后再试。'}
        if($Action -in @('Stop','Restart')){Progress-Stage '正在停止本项目的机器人与记忆服务…';& (Join-Path $ProjectDir 'stop-all.ps1')|Out-Null}
        if($Action -in @('Start','Restart')){
            $marker=Join-Path $ProjectDir '.run\control-console\restart-required.json'
            $beforeMarker=if(Test-Path $marker){[IO.File]::ReadAllText($marker)}else{''}
            Progress-Stage '正在预热记忆并连接QQ，界面可以继续操作…'
            & (Join-Path $ProjectDir 'start-all.ps1')|Out-Null
            $deadline=[DateTime]::UtcNow.AddSeconds(65)
            do{$data=Get-ControllerStatus;if($data.qq -eq 'ready' -and $data.memory -eq 'ready'){break};Start-Sleep -Milliseconds 800}while([DateTime]::UtcNow -lt $deadline)
            if($data.qq -ne 'ready'){throw '进程已启动，但QQ尚未确认上线。请在日志页查看连接情况。'}
            if($beforeMarker -and (Test-Path $marker) -and [IO.File]::ReadAllText($marker) -eq $beforeMarker){Remove-Item -LiteralPath $marker -Force}
            $data=Get-ControllerStatus
            $message=if($data.memory -eq 'ready'){'机器人已就绪，长期记忆已就绪。'}else{'机器人已就绪，记忆服务仍在预热。'}
        }else{
            $data=Get-ControllerStatus
            if($data.qqPid -or $data.memoryPid){throw '仍有受管进程没有退出，请查看运行日志。'}
            $message='机器人与记忆服务已关闭，历史会话和记忆已保留。'
        }
    }
    elseif($Action -eq 'OpenCodex'){
        $native=Get-Content (Join-Path $ProjectDir 'data\codex-work\config.json') -Raw -Encoding UTF8|ConvertFrom-Json
        $env:CODEX_HOME=[string]$native.codexHome
        & ([string]$native.codexPath) app ([string]$native.cwd)|Out-Null
        if($LASTEXITCODE -ne 0){throw 'Codex未能打开，请手动在Codex中查找“柚柚QQ”。'}
        $data=@{};$message='已打开Codex记忆工作目录；在历史列表查找“柚柚QQ”，可查看对应QQ会话。'
    }
    elseif($Action -in @('RefreshCodex','ProbeCodex')){
        $probe=[Uri]'https://api.openai.com';$proxy=[Net.WebRequest]::DefaultWebProxy.GetProxy($probe)
        if($proxy -and $proxy -ne $probe){$env:HTTPS_PROXY=$proxy.AbsoluteUri;$env:HTTP_PROXY=$proxy.AbsoluteUri;$env:NODE_USE_ENV_PROXY='1'}
        $env:NO_PROXY='localhost,127.0.0.1,::1'
        & (Join-Path $ProjectDir '.venv\Scripts\python.exe') (Join-Path $ProjectDir 'configure-native-codex.py') --project $ProjectDir|Out-Null
        if($LASTEXITCODE -ne 0){throw '未能定位Codex，请检查本机Codex安装。'}
        $operation=if($Action -eq 'ProbeCodex'){'probe'}else{'models'}
        $arguments=@((Join-Path $QqProfileDir 'node_modules\dsh-chatgpt-plan\native-cli.js'),$operation,'--directory',(Join-Path $ProjectDir 'data\codex-work'))
        if($Action -eq 'ProbeCodex'){$request=Get-Content -LiteralPath $RequestPath -Raw -Encoding UTF8|ConvertFrom-Json;if([string]$request.model -notmatch '^gpt-[A-Za-z0-9._-]{1,100}$'){throw '请选择Codex提供的模型。'};$arguments+=@('--model',[string]$request.model)}
        Progress-Stage '正在连接本机Codex原生服务…'
        $output=& node @arguments
        if($LASTEXITCODE -ne 0){throw 'Codex连接未完成，请确认本机Codex已登录、网络正常。原有路由保持。'}
        $data=@{};$message=if($Action -eq 'ProbeCodex'){'Codex模型已实际完成回复，可以切换。'}else{'已刷新本机Codex连接与Luna模型。'}
    }
    elseif($Action -eq 'ConnectChatUI'){
        $helper=Join-Path $ProjectDir 'connect-chat-ui.ps1'
        Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-STA','-File',('"'+$helper+'"'),'-ProjectDir',('"'+$ProjectDir+'"')) -WindowStyle Hidden|Out-Null
        $data=@{};$message='普通Chat连接向导已打开，请在常用Edge中加载本地扩展并配对。'
    }
    elseif($Action -eq 'ProbeChatUI'){
        $cli=Join-Path $QqProfileDir 'node_modules\dsh-chatgpt-plan\chat-ui-cli.js'
        Progress-Stage '正在通过专用Chat工作页验证回复，不读取QQ记忆…'
        $output=& node $cli probe --directory (Join-Path $ProjectDir 'data\chatgpt-chat')
        if($LASTEXITCODE -ne 0){throw 'Chat工作页验证未完成。请重新加载本地扩展、打开专用工作对话并保持在Chat模式。'}
        $data=@{};$message='Chat工作页已完成一次真实回复，可以选择此工作路由。'
    }
    elseif($Action -eq 'ConnectChatGPT'){
        & (Join-Path $ProjectDir 'connect-chatgpt.ps1') -ProjectDir $ProjectDir|Out-Null
        $data=@{};$message='已打开OpenAI官方授权页，请在浏览器完成登录与套餐授权。'
    }
    elseif($Action -in @('RefreshChatGPT','ProbeChatGPT')){
        $probe=[Uri]'https://api.openai.com';$proxy=[Net.WebRequest]::DefaultWebProxy.GetProxy($probe)
        if($proxy -and $proxy -ne $probe){if(-not $env:HTTPS_PROXY){$env:HTTPS_PROXY=$proxy.AbsoluteUri};if(-not $env:HTTP_PROXY){$env:HTTP_PROXY=$proxy.AbsoluteUri}}
        if($env:HTTPS_PROXY -or $env:HTTP_PROXY){$env:NODE_USE_ENV_PROXY='1';$env:NO_PROXY='localhost,127.0.0.1,::1'}
        $operation=if($Action -eq 'RefreshChatGPT'){'models'}else{'probe'}
        $chatCli=Join-Path $QqProfileDir 'node_modules\dsh-chatgpt-plan\cli.js'
        if(-not(Test-Path -LiteralPath $chatCli)){throw 'ChatGPT provider is not installed in the qqbot profile.'}
        $chatArguments=@($chatCli,$operation,'--directory',(Join-Path $ProjectDir 'data\chatgpt-plan'))
        if($Action -eq 'ProbeChatGPT'){
            $request=Get-Content -LiteralPath $RequestPath -Raw -Encoding UTF8|ConvertFrom-Json
            if([string]$request.model -notmatch '^[A-Za-z0-9._:-]{1,150}$'){throw '请选择账号提供的模型。'}
            $chatArguments+=@('--model',[string]$request.model)
        }
        Progress-Stage '正在连接ChatGPT账号，界面仍可操作…'
        $output=& node @chatArguments
        if($LASTEXITCODE -ne 0){throw 'ChatGPT请求尚未完成，请检查网络或重新授权；现有模型设置保持。'}
        $data=@{};$message=if($Action -eq 'RefreshChatGPT'){'已刷新账号可用模型。'}else{'所选模型已实际完成回复，可以切换。'}
    }
    elseif($Action -eq 'ExportMemory'){
        Progress-Stage '正在导出记忆，服务会短暂停止并在完成后恢复…'
        $stamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
        $destination=Join-Path $ProjectDir ('exports\yuzu-memory-'+$stamp+'.json')
        & (Join-Path $ProjectDir 'export-memory.ps1') -OutputFile $destination|Out-Null
        if(-not (Test-Path -LiteralPath $destination)){throw '未找到导出结果，请查看本机日志。'}
        $summary=Get-Content -LiteralPath $destination -Raw -Encoding UTF8|ConvertFrom-Json
        $data=@{path=$destination;memoryCount=$summary.memory_count;partitionCount=$summary.partition_count}
        $message='记忆JSON已保存到本机导出目录。'
    }
    else{
        $python=Join-Path $ProjectDir '.venv\Scripts\python.exe'
        $pythonResult=$ResultPath+'.python.json'
        $arguments=@((Join-Path $ProjectDir 'control_settings.py'),'--project',$ProjectDir,'--profile',$QqProfileDir,'--action',$Action,'--result',$pythonResult)
        if($RequestPath){$arguments+=@('--request',$RequestPath)}
        & $python @arguments|Out-Null
        if(-not(Test-Path -LiteralPath $pythonResult)){throw '配置操作未返回结果，请重新载入后再试。'}
        $reply=Get-Content -LiteralPath $pythonResult -Raw -Encoding UTF8|ConvertFrom-Json
        Remove-Item -LiteralPath $pythonResult -Force
        if(-not $reply.success){Write-ControllerJson $ResultPath $reply;exit 1}
        $data=$reply.data
        $message=switch($Action){'SaveCompanion'{'主动消息设置已保存，后续调度使用新设置。'}'SaveGroup'{'群聊设置和本机备注已保存。'}'SavePersona'{'人设已保存到私聊和群聊配置，重启机器人后完全生效。'}'SaveStreaming'{'回复方式已保存，重启机器人后生效。'}'Backup'{'配置备份已保存到本机导出目录。'}default{'已载入最新配置。'}}
        if($Action -eq 'ReadingImport'){$message='书籍已导入，后续按书签逐段阅读；导入不代表已经读过。'}
        if($Action -eq 'ReadingNext'){$message='已请求阅读下一段；完成并核对前，书签保持不动。'}
        if($Action -eq 'ReadingAuto'){$message='自动阅读设置已更新；正在读取的一段会先保存。'}
        if($Action -eq 'ReadingStatus'){$message='阅读进度和笔记已刷新。'}
        if($Action -eq 'ReadingExport'){$message='全部阅读笔记已导出到本机。'}
        if($Action -eq 'SaveImages'){$message='生图设置已保存，下次任务检查时生效；已在发送中的图片可能无法撤回。'}
        if($Action -eq 'SaveModel'){$message='对话模型已更新；重启后图片识别等入口会完全切换。'}
        if($Action -in @('CancelImage','RetryImage')){$message='已提交生图任务操作，等待机器人处理。'}
        if($Action -eq 'Backup' -and $data.path){$account=[Security.Principal.WindowsIdentity]::GetCurrent().Name;& icacls.exe $data.path /inheritance:r /grant:r ($account+':F') 'SYSTEM:F'|Out-Null;if($LASTEXITCODE -ne 0){throw '备份已生成，但文件权限设置未完成，请查看本机导出目录。'}}
    }
    Write-ControllerJson $ResultPath @{success=$true;data=$data;message=$message}
}catch{
    Write-ControllerJson $ResultPath @{success=$false;message=$_.Exception.Message}
    exit 1
}finally{
    if($acquired){$operationMutex.ReleaseMutex()}
    if($operationMutex){$operationMutex.Dispose()}
}
