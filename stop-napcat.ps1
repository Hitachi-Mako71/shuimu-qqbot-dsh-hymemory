$ErrorActionPreference='Stop'
$project=$PSScriptRoot
$file=Join-Path $project '.run/napcat-launch.private.json'
if(-not(Test-Path -LiteralPath $file)){return}
$record=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json
$expectedRoot=[IO.Path]::GetFullPath((Join-Path $project 'runtime/napcat'))+[IO.Path]::DirectorySeparatorChar
$expectedExe=[IO.Path]::GetFullPath([string]$record.executable)
if(-not $expectedExe.StartsWith($expectedRoot,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($expectedExe) -ne 'NapCatWinBootMain.exe'){throw 'NapCat process record is outside this project'}
$process=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$record.pid) -ErrorAction SilentlyContinue
if($process -and $process.ExecutablePath -eq $expectedExe -and $process.CommandLine.Contains([string]$record.qqExecutable)){
    & taskkill.exe /PID $record.pid /T /F | Out-Null
}
Remove-Item -LiteralPath $file -Force
