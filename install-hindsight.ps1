param([string]$ProjectDir=$PSScriptRoot)
$ErrorActionPreference='Stop'
$ProjectDir=(Resolve-Path -LiteralPath $ProjectDir).Path
$root=Join-Path $ProjectDir 'hindsight'
$python=Join-Path $root '.venv/Scripts/python.exe'
if(-not(Test-Path -LiteralPath $python)){
    & (Join-Path $ProjectDir '.venv/Scripts/python.exe') -m venv (Join-Path $root '.venv')
    if($LASTEXITCODE -ne 0){throw 'Could not create isolated Hindsight environment'}
}
& $python -c "from importlib.metadata import version; assert version('hindsight-api-slim')=='1.1.0'; assert version('hindsight-client')=='1.1.0'; assert version('pg0-embedded')=='0.15.2'; assert version('flashrank')=='0.2.10'" 2>$null
$versionsReady=$LASTEXITCODE -eq 0
if($versionsReady){& $python -m pip check;$versionsReady=$LASTEXITCODE -eq 0}
if(-not $versionsReady){
    & $python -m pip install -r (Join-Path $ProjectDir 'requirements-hindsight-lock.txt')
    if($LASTEXITCODE -ne 0){throw 'Hindsight dependency installation failed'}
    & $python -m pip check
    if($LASTEXITCODE -ne 0){throw 'Hindsight dependency check failed'}
}
Write-Host 'Hindsight environment ready. Existing credentials and engine selection were preserved.'
