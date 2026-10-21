param([string]$DshHome = $(if($env:DSH_HOME){$env:DSH_HOME}else{'D:\DeepSeekHarnessData\home'}))
$ErrorActionPreference = 'Stop'
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:DSH_HOME = $DshHome
$ProfileDir = Join-Path $DshHome 'profiles\qqbot'
Set-Location -LiteralPath $ProjectDir
if(Test-Path (Join-Path $ProjectDir '.run\services.json')){& (Join-Path $ProjectDir 'stop-all.ps1')}
New-Item -ItemType Directory -Force -Path (Join-Path $ProjectDir 'data'),(Join-Path $ProjectDir 'packages') | Out-Null
$LocalPython = Join-Path $DshHome 'dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
if(-not(Test-Path $LocalPython)){$LocalPython=(Get-Command python -ErrorAction Stop).Source}
$Python=Join-Path $ProjectDir '.venv\Scripts\python.exe'
if(-not(Test-Path $Python)){
    & $LocalPython -m venv (Join-Path $ProjectDir '.venv')
    if($LASTEXITCODE -ne 0){throw 'Python venv creation failed. Use Python 3.12 on Windows.'}
}
$Requirements=Join-Path $ProjectDir 'requirements-lock.txt'
if(-not(Test-Path $Requirements)){$Requirements=Join-Path $ProjectDir 'requirements.txt'}
& $Python -m pip install --quiet -r $Requirements
if($LASTEXITCODE -ne 0){throw 'Hy Memory dependency install failed. Check PyPI access.'}
$Runtime=Join-Path $ProjectDir 'runtime'
& npm.cmd install --prefix $Runtime --no-audit --no-fund '@deepseek-ai/dsh@0.2.1-rc.2'
if($LASTEXITCODE -ne 0){throw 'DSH runtime install failed. Check npm registry connectivity.'}
$DshBin=Join-Path $Runtime 'node_modules\@deepseek-ai\dsh\lib\bin.js'
& node $DshBin plugin --profile qqbot add '@tencent-connect/dsh-qqbot@0.5.2'
if($LASTEXITCODE -ne 0){throw 'Official QQ plugin install failed.'}
$Packed=& npm.cmd pack (Join-Path $ProjectDir 'dsh-hymemory-plugin') --pack-destination (Join-Path $ProjectDir 'packages') --json
if($LASTEXITCODE -ne 0){throw 'Local Cordis plugin packaging failed.'}
$PackageName=(($Packed -join "`n") | ConvertFrom-Json)[0].filename
& node $DshBin plugin --profile qqbot add (Join-Path $ProjectDir ('packages\'+$PackageName))
if($LASTEXITCODE -ne 0){throw 'Local Cordis plugin install failed.'}
& $Python (Join-Path $ProjectDir 'configure-profile.py') --project $ProjectDir --profile $ProfileDir
if($LASTEXITCODE -ne 0){throw 'Dedicated profile configuration failed.'}
Push-Location -LiteralPath $ProfileDir
try{
    & pnpm.cmd install --no-frozen-lockfile
    if($LASTEXITCODE -ne 0){throw 'Pinned QQ transport patch installation failed.'}
}finally{Pop-Location}
$EnvPath=Join-Path $ProjectDir '.env'
if(-not(Test-Path $EnvPath)){
    $Token=[Guid]::NewGuid().ToString('N')+[Guid]::NewGuid().ToString('N')
    $Template=Get-Content -LiteralPath (Join-Path $ProjectDir '.env.example') -Raw -Encoding UTF8
    [IO.File]::WriteAllText($EnvPath,$Template.Replace('__LOCAL_TOKEN__',$Token),(New-Object Text.UTF8Encoding($false)))
    $Account=[Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $EnvPath /inheritance:r /grant:r ($Account+':F') 'SYSTEM:F' | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Could not restrict local token file permissions.'}
}
# DSH_HOME belongs in the launch environment. DSH rejects bootstrap variables in .env.
. (Join-Path $ProjectDir 'import-local-config.ps1')
Import-QqLocalConfig $ProjectDir
& $Python -c "from hymemory_service import get_embedding; v=next(iter(get_embedding().embed(['embedding warmup']))); assert len(v)==512; print('Local embedding ready: 512 dimensions')"
if($LASTEXITCODE -ne 0){throw 'Local embedding initialization failed. Check Hugging Face connectivity/cache.'}
Write-Host 'Installed pinned QQ/DSH/Hy Memory integration. Data and existing local credentials were preserved.'
Write-Host 'If needed, run .\configure-qq-local.ps1 to verify local QQ credentials; then .\start-all.ps1.'
