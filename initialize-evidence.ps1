# Restrict the independent archive before Node or Python creates database files.
function Initialize-QqEvidence([string]$ProjectDir) {
    $directory=Join-Path $ProjectDir 'data\evidence'
    if(-not(Test-Path -LiteralPath $directory)){New-Item -ItemType Directory -Path $directory -Force|Out-Null}
    $item=Get-Item -LiteralPath $directory
    if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Evidence directory must not be a link'}
    $account=[Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $directory /inheritance:r /grant:r ($account+':(OI)(CI)F') 'SYSTEM:(OI)(CI)F'|Out-Null
    if($LASTEXITCODE -ne 0){throw 'Could not restrict QQ evidence directory'}
    $env:QQBOT_EVIDENCE_DIR=$directory
    $timetables=Join-Path $ProjectDir 'data\timetables'
    if(-not(Test-Path -LiteralPath $timetables)){New-Item -ItemType Directory -Path $timetables -Force|Out-Null}
    if((Get-Item -LiteralPath $timetables).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Timetable directory must not be a link'}
    & icacls.exe $timetables /inheritance:r /grant:r ($account+':(OI)(CI)F') 'SYSTEM:(OI)(CI)F'|Out-Null
    if($LASTEXITCODE -ne 0){throw 'Could not restrict timetable directory'}
    $privacy=Join-Path $ProjectDir '.privacy'
    if(-not(Test-Path -LiteralPath $privacy)){New-Item -ItemType Directory -Path $privacy -Force|Out-Null}
    if((Get-Item -LiteralPath $privacy).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Privacy authority must not be a link'}
    & icacls.exe $privacy /inheritance:r /grant:r ($account+':(OI)(CI)F') 'SYSTEM:(OI)(CI)F'|Out-Null
    if($LASTEXITCODE -ne 0){throw 'Could not restrict privacy authority'}
    $env:QQBOT_PRIVACY_DIR=$privacy
    $env:QQBOT_PRIVACY_REQUIRED='true'
}
