param([string]$ProjectDir=$PSScriptRoot)
$ErrorActionPreference='Stop'
& (Join-Path $ProjectDir 'start-chat-ui.ps1') -ProjectDir $ProjectDir|Out-Null
$dshHome=if($env:DSH_HOME){$env:DSH_HOME}else{'D:\DeepSeekHarnessData\home'}
$cli=Join-Path $dshHome 'profiles\qqbot\node_modules\dsh-chatgpt-plan\chat-ui-cli.js'
$raw=& node $cli pair --directory (Join-Path $ProjectDir 'data\chatgpt-chat')
if($LASTEXITCODE -ne 0){throw 'Could not prepare local browser pairing'}
$pair=($raw -join "`n")|ConvertFrom-Json
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$form=New-Object Windows.Forms.Form;$form.Text='柚柚 · 连接普通 Chat';$form.Size=New-Object Drawing.Size(700,460);$form.StartPosition='CenterScreen';$form.Font=New-Object Drawing.Font('Microsoft YaHei UI',10)
$label=New-Object Windows.Forms.Label;$label.SetBounds(20,18,640,130);$label.Text="1. 打开 Edge 扩展管理页，重新加载“柚柚 · Chat 工作桥接”（首次使用再加载下方文件夹）。`r`n2. 点击扩展图标；只有首次连接需要输入本窗口配对码。`r`n3. 点「打开专用 Chat 工作对话」，确认顶部选择的是 Chat，再点确认。`r`n4. 保持这个专用标签页打开；之后会复用它处理独立任务。";$form.Controls.Add($label)
$folder=Join-Path $ProjectDir 'chat-ui-extension'
$pathBox=New-Object Windows.Forms.TextBox;$pathBox.SetBounds(20,156,640,30);$pathBox.Text=$folder;$pathBox.ReadOnly=$true;$form.Controls.Add($pathBox)
$code=New-Object Windows.Forms.TextBox;$code.SetBounds(20,201,640,30);$code.Text=$pair.code;$code.ReadOnly=$true;$form.Controls.Add($code)
$hint=New-Object Windows.Forms.Label;$hint.SetBounds(20,244,640,65);$hint.Text='配对码15分钟有效，只在本机扩展输入。扩展不读取其他标签页、Cookie或登录令牌。QQ附件只用于当前任务；生成文件会下载到隔离目录后发送回当前QQ会话。';$form.Controls.Add($hint)
$extensions=New-Object Windows.Forms.Button;$extensions.Text='打开Edge扩展管理';$extensions.SetBounds(20,326,210,42);$extensions.Add_Click({Start-Process 'msedge.exe' -ArgumentList 'edge://extensions/'});$form.Controls.Add($extensions)
$copy=New-Object Windows.Forms.Button;$copy.Text='复制配对码';$copy.SetBounds(245,326,180,42);$copy.Add_Click({[Windows.Forms.Clipboard]::SetText($code.Text)});$form.Controls.Add($copy)
$done=New-Object Windows.Forms.Button;$done.Text='已完成';$done.SetBounds(440,326,180,42);$done.Add_Click({$form.Close()});$form.Controls.Add($done)
$null=$form.ShowDialog();$form.Dispose()
