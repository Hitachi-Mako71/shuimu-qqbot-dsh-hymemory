$ErrorActionPreference = 'Stop'
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ProjectDir 'import-local-config.ps1')
Import-QqLocalConfig $ProjectDir
Set-Location $ProjectDir
& (Join-Path $ProjectDir '.venv\Scripts\python.exe') -u (Join-Path $ProjectDir 'hymemory_service.py')
