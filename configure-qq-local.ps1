$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$project=Split-Path -Parent $MyInvocation.MyCommand.Path
$form=New-Object Windows.Forms.Form
$form.Text='QQ Bot local credentials'
$form.Size=New-Object Drawing.Size(600,260)
$form.StartPosition='CenterScreen'
$form.TopMost=$true
$label=New-Object Windows.Forms.Label
$label.Text='Paste current credentials from QQ Open Platform. Values stay on this PC.'
$label.Location=New-Object Drawing.Point(20,15)
$label.Size=New-Object Drawing.Size(550,35)
$form.Controls.Add($label)
$id=New-Object Windows.Forms.TextBox
$id.Text=''
$previousCredentials=Join-Path $project 'qq.credentials.json'
if(Test-Path -LiteralPath $previousCredentials){
 try{$previous=Get-Content -LiteralPath $previousCredentials -Raw -Encoding UTF8|ConvertFrom-Json;$id.Text=$previous.appId}catch{}
}
$id.Location=New-Object Drawing.Point(120,60)
$id.Width=430
$form.Controls.Add($id)
$secret=New-Object Windows.Forms.TextBox
$secret.UseSystemPasswordChar=$true
$secret.Location=New-Object Drawing.Point(120,100)
$secret.Width=430
$form.Controls.Add($secret)
foreach($row in @(@('AppID',60),@('AppSecret',100))){
 $l=New-Object Windows.Forms.Label;$l.Text=$row[0];$l.Location=New-Object Drawing.Point(20,$row[1]);$l.Width=95;$form.Controls.Add($l)
}
$status=New-Object Windows.Forms.Label
$status.Location=New-Object Drawing.Point(20,145)
$status.Size=New-Object Drawing.Size(360,45)
$form.Controls.Add($status)
$button=New-Object Windows.Forms.Button
$button.Text='Verify and save'
$button.Location=New-Object Drawing.Point(400,155)
$button.Width=150
$button.Add_Click({
 $button.Enabled=$false;$status.Text='Verifying with Tencent...';$form.Refresh()
 try {
  $credentials=@{appId=$id.Text.Trim();appSecret=$secret.Text.Trim()}
  $reply=Invoke-RestMethod -Uri 'https://bots.qq.com/app/getAppAccessToken' -Method Post -ContentType 'application/json' -Body (@{appId=$credentials.appId;clientSecret=$credentials.appSecret}|ConvertTo-Json -Compress) -TimeoutSec 15
  if(-not $reply.access_token){$status.Text='Tencent rejected credentials (code '+$reply.code+'). Copy the current secret again.';return}
  $destination=Join-Path $project 'qq.credentials.json'
  $credentials|ConvertTo-Json|Set-Content -LiteralPath $destination -Encoding UTF8
  $currentAccount=[Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls.exe $destination /inheritance:r /grant:r "${currentAccount}:(F)" 'SYSTEM:(F)' | Out-Null
  [IO.File]::WriteAllText((Join-Path $project 'qq.credentials.verified'),[DateTime]::UtcNow.ToString('o'))
  $form.DialogResult=[Windows.Forms.DialogResult]::OK;$form.Close()
 } catch {$status.Text='Verification failed. Check network and current platform secret.'}
 finally {$button.Enabled=$true}
})
$form.Controls.Add($button)
$form.AcceptButton=$button
$null=$form.ShowDialog()
