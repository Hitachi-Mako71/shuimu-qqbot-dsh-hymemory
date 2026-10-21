$ErrorActionPreference='Stop'
$project=Split-Path -Parent $MyInvocation.MyCommand.Path
$run=Join-Path $project '.run'
$logs=Join-Path $project 'logs'
New-Item -ItemType Directory -Force -Path $run,$logs | Out-Null
$file=Join-Path $run 'services.json'
$previous=if(Test-Path $file){Get-Content $file -Raw|ConvertFrom-Json}else{$null}
$services=@{}
foreach($name in @('memory','qqbot')){
    $script=Join-Path $project ('start-'+$name+'.ps1')
    $old=if($previous){$previous.$name}else{$null}
    $existing=if($old){Get-CimInstance Win32_Process -Filter ('ProcessId='+$old.pid) -ErrorAction SilentlyContinue}else{$null}
    if($existing -and $existing.CommandLine.Contains($script)){$services[$name]=$old;continue}
    $args=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$script+'"'))
    $process=Start-Process powershell.exe -ArgumentList $args -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs ($name+'.out.log')) -RedirectStandardError (Join-Path $logs ($name+'.err.log')) -PassThru
    $services[$name]=@{pid=$process.Id;script=$script}
    if($name -eq 'memory'){
        $deadline=[DateTime]::UtcNow.AddSeconds(30)
        $ready=$false
        do{
            try{
                $health=Invoke-RestMethod 'http://127.0.0.1:8765/health' -TimeoutSec 1
                $ready=$health.sdk_ready -and $health.embedding_ready
            }catch{}
            if(-not $ready){Start-Sleep -Milliseconds 500}
        }while(-not $ready -and [DateTime]::UtcNow -lt $deadline)
        if(-not $ready){Write-Warning 'Memory warmup is still unavailable; QQ will start with graceful memory fallback.'}
    }
}
$services|ConvertTo-Json|Set-Content -LiteralPath $file -Encoding UTF8
Write-Host 'Started QQ/DSH and Hy Memory in hidden background processes. Logs are in the local logs directory.'
