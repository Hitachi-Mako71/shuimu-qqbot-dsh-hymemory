$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$ConsoleMutex=New-Object Threading.Mutex($false,'Local\YuzuRobotControlConsole')
try{$ConsoleAcquired=$ConsoleMutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$ConsoleAcquired=$true}
if(-not $ConsoleAcquired){$shell=New-Object -ComObject WScript.Shell;$null=$shell.AppActivate('柚柚机器人控制台');$ConsoleMutex.Dispose();exit 0}
$Project=Split-Path -Parent $MyInvocation.MyCommand.Path
$JobDir=Join-Path $Project '.run\control-console\jobs'
New-Item -ItemType Directory -Force -Path $JobDir|Out-Null
$C=@{}
foreach($pair in @(@('Bg','#111923'),@('Side','#172230'),@('Card','#1E2B3B'),@('Input','#263648'),@('Text','#EDF3FA'),@('Muted','#A3B2C5'),@('Accent','#8DB8FF'),@('Green','#80D5B3'),@('Amber','#E9C27B'),@('Red','#F29D9D'))){$C[$pair[0]]=[Drawing.ColorTranslator]::FromHtml($pair[1])}
$script:Ui=@{Jobs=@{};Pages=@{};Nav=@{};Dirty=@{companion=$false;group=$false;persona=$false;stream=$false};Loading=$false;Loaded=$false;Busy=$null;Snapshot=$null;Status=$null;SelectedGroup=-1;LastStatus=[DateTime]::MinValue;LastLogs=[DateTime]::MinValue;Page='home';SaveButtons=@();EditControls=@();ServiceButtons=@();RestartRequired=$false}
$script:Tip=New-Object Windows.Forms.ToolTip
$script:Ui.Dirty.images=$false;$script:Ui.LastImages=[DateTime]::MinValue;$script:Ui.ImageRows=@()
$script:Ui.Dirty.chatModel=$false;$script:Ui.ChatCatalog=@();$script:Ui.LastModels=[DateTime]::MinValue
function Text-Line([string]$Text,[int]$Size=10,[bool]$Bold=$false,[int]$Height=28){
    $x=New-Object Windows.Forms.Label;$x.Text=$Text;$x.AutoSize=$false;$x.Height=$Height;$x.Dock='Top';$x.ForeColor=$C.Text
    $style=if($Bold){[Drawing.FontStyle]::Bold}else{[Drawing.FontStyle]::Regular};$x.Font=New-Object Drawing.Font('Microsoft YaHei UI',$Size,$style);return $x
}
function Action-Button([string]$Text,[string]$Kind='normal',[int]$Width=132){
    $x=New-Object Windows.Forms.Button;$x.Text=$Text;$x.Width=$Width;$x.Height=40;$x.FlatStyle='Flat';$x.FlatAppearance.BorderSize=0;$x.Margin=New-Object Windows.Forms.Padding(0,0,10,8);$x.ForeColor=$C.Text;$x.BackColor=$C.Input
    if($Kind -eq 'primary'){$x.BackColor=[Drawing.ColorTranslator]::FromHtml('#83B4F8');$x.ForeColor=$C.Bg}
    if($Kind -eq 'danger'){$x.BackColor=[Drawing.ColorTranslator]::FromHtml('#58323E');$x.ForeColor=$C.Red}
    return $x
}
function Stack-Panel{
    $x=New-Object Windows.Forms.TableLayoutPanel;$x.ColumnCount=1;$x.RowCount=0;$x.Dock='Top';$x.AutoSize=$true;$x.AutoSizeMode='GrowAndShrink';$x.Margin=New-Object Windows.Forms.Padding(0)
    [void]$x.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle([Windows.Forms.SizeType]::Percent,100)));return $x
}
function Stack-Add($Stack,$Control,[int]$Gap=12){
    $row=$Stack.RowCount;$Stack.RowCount++;[void]$Stack.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::AutoSize)))
    $Control.Dock='Top';$Control.Margin=New-Object Windows.Forms.Padding(0,0,0,$Gap);$Stack.Controls.Add($Control,0,$row)
}
function Card([string]$Title,[string]$Description=''){
    $panel=Stack-Panel;$panel.BackColor=$C.Card;$panel.Padding=New-Object Windows.Forms.Padding(18)
    Stack-Add $panel (Text-Line $Title 11 $true 30) 4
    if($Description){$hint=Text-Line $Description 9 $false 42;$hint.ForeColor=$C.Muted;Stack-Add $panel $hint 6}
    $body=Stack-Panel;Stack-Add $panel $body 0
    return @{Panel=$panel;Body=$body}
}
function Flow-Actions{
    $x=New-Object Windows.Forms.FlowLayoutPanel;$x.Dock='Top';$x.AutoSize=$true;$x.WrapContents=$true;$x.Margin=New-Object Windows.Forms.Padding(0);return $x
}
function Check-Field([string]$Text){
    $x=New-Object Windows.Forms.CheckBox;$x.Text=$Text;$x.Height=38;$x.Dock='Top';$x.ForeColor=$C.Text;$script:Ui.EditControls+=,$x;return $x
}
function Choice-Field([string[]]$Choices){
    $x=New-Object Windows.Forms.ComboBox;$x.DropDownStyle='DropDownList';$x.FlatStyle='Flat';$x.BackColor=$C.Input;$x.ForeColor=$C.Text;$x.Height=32;$x.Dock='Top';$x.Items.AddRange($Choices);$script:Ui.EditControls+=,$x;return $x
}
function Input-Field{
    $x=New-Object Windows.Forms.TextBox;$x.BackColor=$C.Input;$x.ForeColor=$C.Text;$x.BorderStyle='FixedSingle';$x.Dock='Top';$script:Ui.EditControls+=,$x;return $x
}
function Field-Row($HostPanel,[string]$Label,$Control,[string]$Hint=''){
    Stack-Add $HostPanel (Text-Line $Label 9 $false 24) 2;Stack-Add $HostPanel $Control 8
    if($Hint){$h=Text-Line $Hint 9 $false 42;$h.ForeColor=$C.Muted;Stack-Add $HostPanel $h 4}
}
function Save-Button([string]$Text){$x=Action-Button $Text 'primary' 156;$script:Ui.SaveButtons+=,$x;return $x}
function Notify([string]$Message,[string]$Kind='info'){
    $script:Ui.Footer.Text=$Message;$script:Ui.Footer.ForeColor=switch($Kind){'error'{$C.Red}'success'{$C.Green}'warning'{$C.Amber}default{$C.Muted}}
    $script:Tip.SetToolTip($script:Ui.Footer,$Message)
}
function Mark-Dirty([string]$Key){
    if($script:Ui.Loading){return};$script:Ui.Dirty[$Key]=$true;Update-DirtyLabels
}
function Update-DirtyLabels{
    foreach($entry in @(@('companion','主动消息'),@('group','群聊设置'),@('persona','人设与回复'),@('images','生图与形象'),@('models','对话模型'))){$key=if($entry[0] -eq 'models'){'chatModel'}else{$entry[0]};$dirty=$script:Ui.Dirty[$key];if($entry[0] -eq 'persona'){$dirty=$dirty -or $script:Ui.Dirty.stream};$script:Ui.Nav[$entry[0]].Text=$entry[1]+$(if($dirty){'  •'}else{''})}
}
function Refresh-Enabled{
    $available=$script:Ui.Loaded -and -not $script:Ui.Busy
    foreach($item in $script:Ui.EditControls){$item.Enabled=$available}
    foreach($item in $script:Ui.SaveButtons){$item.Enabled=$available}
    if($script:Ui.GroupRows -and $script:Ui.SelectedGroup -ge 0){$g=$script:Ui.GroupRows[$script:Ui.SelectedGroup];$script:Ui.GroupEnabled.Enabled=$available -and $g.bound}
    else{foreach($item in @($script:Ui.GroupEnabled,$script:Ui.GroupAlias,$script:Ui.GroupFrequency,$script:Ui.GroupSave)){$item.Enabled=$false}}
    $running=$script:Ui.Status -and ($script:Ui.Status.qqPid -gt 0 -or $script:Ui.Status.memoryPid -gt 0)
    foreach($button in $script:Ui.ServiceButtons){$button.Enabled=-not $script:Ui.Busy;if($button.Tag -in @('Stop','Restart')){$button.Enabled=$button.Enabled -and $running}}
    foreach($button in @($script:Ui.BackupButton,$script:Ui.ExportButton)){$button.Enabled=$available}
    $script:Ui.PendingButton.Enabled=-not $script:Ui.Busy
    Update-ImageSelection
}
function Apply-Reading($Data){
    $script:Ui.ReadingRows=@($Data.books)
    $selected=if($script:Ui.ReadingBooks.SelectedIndex -ge 0 -and $script:Ui.ReadingOldRows){$script:Ui.ReadingOldRows[$script:Ui.ReadingBooks.SelectedIndex].book}else{''}
    $script:Ui.ReadingBooks.Items.Clear();$index=0;$chosen=0
    foreach($b in $script:Ui.ReadingRows){[void]$script:Ui.ReadingBooks.Items.Add(('《'+$b.title+'》  '+$b.cursor+'/'+$b.total+' 段'));if($b.book -eq $selected){$chosen=$index};$index++}
    $script:Ui.ReadingOldRows=$script:Ui.ReadingRows
    if($script:Ui.ReadingRows.Count){$script:Ui.ReadingBooks.SelectedIndex=$chosen}
    $script:Ui.ReadingSummary.Text=(@($Data.books|ForEach-Object {"《$($_.title)》 · 已读 $($_.cursor)/$($_.total) 段 · 书签到PDF第 $($_.lastPage) 页 · Hy Memory已确认 $($_.indexed) 段 · "+$(if($_.auto){'自动阅读开启'}else{'已暂停'})+$(if($_.error){' · 上次读取未完成，书签未推进'}else{''})}) -join "`r`n")
    if(-not $Data.books.Count){$script:Ui.ReadingSummary.Text='书架为空。导入只建立书源，模型不会一次接收整本PDF。'}
    $notes=@($Data.notes)
    if($notes.Count){$n=$notes[0];$script:Ui.ReadingNotes.Text="《$($n.title)》 · PDF第 $($n.pages -join '、') 页的一段内容`r`n`r`n感悟`r`n$($n.reflection)`r`n`r`n逐段摘要`r`n$($n.summary)`r`n`r`n截至此处的整体理解`r`n$($n.overview)`r`n`r`n原文依据`r`n"+(@($n.evidence|ForEach-Object {"PDF第$($_.page)页：$($_.quote)"}) -join "`r`n")+"`r`n`r`n未解问题`r`n"+($n.questions -join "`r`n")}else{$script:Ui.ReadingNotes.Text='尚无已完成并核对的阅读笔记，不展示虚构感悟。'}
}

function Show-Page([string]$Key){
    foreach($name in $script:Ui.Pages.Keys){$script:Ui.Pages[$name].Visible=($name -eq $Key);$script:Ui.Nav[$name].BackColor=if($name -eq $Key){$C.Input}else{$C.Side};$script:Ui.Nav[$name].ForeColor=if($name -eq $Key){$C.Accent}else{$C.Muted}}
    $script:Ui.Page=$Key;$script:Ui.Pages[$Key].BringToFront()
    $titles=@{home=@('概览','查看柚柚的运行情况与常用操作');companion=@('主动消息','调整她主动分享日常的节奏');group=@('群聊设置','为不同群聊设置独立的参与方式');persona=@('人设与回复','编辑交流风格，调整回复显示方式');logs=@('运行日志','查看最近200行，凭证会自动遮蔽');tools=@('备份与导出','把配置和记忆安全保存到本机')}
    $titles.images=@('生图与形象','管理配图节奏、任务与柚柚的固定形象')
    $titles.reading=@('阅读书房','逐段读原书，保存书签、出处、感悟和前后联系')
    $titles.models=@('对话模型','切换DeepSeek、Codex，或无记忆上下文的Chat工作模式')
    $script:Ui.Title.Text=$titles[$Key][0];$script:Ui.Subtitle.Text=$titles[$Key][1]
    if($Key -eq 'reading'){Begin-Job 'ReadingStatus' $null $true}
    if($Key -eq 'logs'){Begin-Job 'Logs' @{channel=$script:Ui.LogChannels[$script:Ui.LogChoice.SelectedIndex]} $true}
    if($Key -eq 'images'){Begin-Job 'ImageTasks' $null $true;if(-not $script:Ui.ImagePicture.Image){Begin-Job 'ImagePreview' @{id='character'} $true}}
}
function Begin-Job([string]$Action,$Payload=$null,[bool]$Quiet=$false){
    if($script:Ui.Jobs.ContainsKey($Action)){return}
    $readOnly=$Action -in @('Status','Snapshot','Logs','ImageTasks','ImagePreview','ReadingStatus')
    if(-not $readOnly -and $script:Ui.Busy){Notify '请等待当前操作完成。' 'warning';return}
    $id=[Guid]::NewGuid().ToString('N');$result=Join-Path $JobDir ($id+'.result.json');$request=Join-Path $JobDir ($id+'.request.json')
    if($null -eq $Payload){$Payload=@{}}
    [IO.File]::WriteAllText($request,(ConvertTo-Json -InputObject $Payload -Depth 15),(New-Object Text.UTF8Encoding($false)))
    $exe=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',('"'+(Join-Path $Project 'control-worker.ps1')+'"'),'-Action',$Action,'-ProjectDir',('"'+$Project+'"'),'-RequestPath',('"'+$request+'"'),'-ResultPath',('"'+$result+'"'))
    try{
        $child=Start-Process -FilePath $exe -ArgumentList $arguments -WindowStyle Hidden -PassThru
        $script:Ui.Jobs[$Action]=@{Action=$Action;Process=$child;Result=$result;Request=$request;Quiet=$Quiet;Started=[DateTime]::UtcNow}
        if(-not $readOnly){$script:Ui.Busy=$Action;$script:Ui.Progress.Visible=$true;Notify '正在后台处理，你可以继续查看其他页面…';Refresh-Enabled}
    }catch{Notify '无法启动后台操作，请检查项目文件是否完整。' 'error'}
}
function Apply-Status($Status){
    $script:Ui.Status=$Status
    $labels=@{ready='已就绪';starting='连接中';stopped='未运行';unknown='待确认'}
    $script:Ui.QqValue.Text=$labels[[string]$Status.qq];$script:Ui.MemoryValue.Text=$labels[[string]$Status.memory]
    $script:Ui.QqValue.ForeColor=if($Status.qq -eq 'ready'){$C.Green}else{$C.Amber}
    $script:Ui.MemoryValue.ForeColor=if($Status.memory -eq 'ready'){$C.Green}else{$C.Amber}
    $script:Ui.QqHint.Text=if($Status.qq -eq 'ready'){'进程运行，已检测到QQ上线记录'}elseif($Status.qq -eq 'starting'){'正在等待QQ网关连接'}else{'可以使用下方按钮启动机器人'}
    $script:Ui.MemoryHint.Text=if($Status.memory -eq 'ready'){'记忆提炼与向量检索已就绪'}elseif($Status.memory -eq 'starting'){'正在启动或预热记忆模型'}else{'启动机器人时会一同启动'}
    $modelError=$Status.modelProvider -eq 'codex' -and $Status.nativeRuntime.phase -eq 'error'
    $script:Ui.StatusPill.Text=if($modelError){'●  Codex对话异常'}elseif($Status.qq -eq 'ready' -and $Status.memory -eq 'ready'){'●  服务已就绪'}elseif($Status.qq -eq 'stopped' -and $Status.memory -eq 'stopped'){'○  服务未运行'}else{'●  部分服务待就绪'}
    $script:Ui.StatusPill.ForeColor=if(-not $modelError -and $Status.qq -eq 'ready' -and $Status.memory -eq 'ready'){$C.Green}else{$C.Amber}
    $script:Ui.LastCheck.Text='最近检查 '+$Status.checkedAt
    $script:Ui.RestartRequired=[bool]$Status.restartRequired;$script:Ui.PendingButton.Visible=$script:Ui.RestartRequired
    Refresh-Enabled
}
function Load-SelectedGroup{
    $index=$script:Ui.GroupList.SelectedIndex
    if($index -lt 0){$script:Ui.SelectedGroup=-1;return}
    $script:Ui.SelectedGroup=$index;$g=$script:Ui.GroupRows[$index]
    $script:Ui.Loading=$true
    try{$script:Ui.GroupEnabled.Checked=[bool]$g.enabled;$script:Ui.GroupAlias.Text=[string]$g.alias;$script:Ui.GroupFrequency.SelectedItem=[string]$g.frequency;$script:Ui.GroupStats.Text="$($g.code)  ·  收到 $($g.messages) 条普通群消息  ·  已接话 $($g.sent) 次`r`n"+$(if($g.bound){[string]$g.status}else{'尚未绑定，请先在QQ完成群友模式绑定。'})}finally{$script:Ui.Loading=$false}
    $script:Ui.Dirty.group=$false;Update-DirtyLabels;Refresh-Enabled
}
function Apply-Snapshot($Snapshot){
    $script:Ui.Loading=$true
    try{
        $previous=$script:Ui.Snapshot;$script:Ui.Snapshot=$Snapshot
        Apply-Images $Snapshot.images
        Apply-ChatModel $Snapshot.chatModel
        if(-not $script:Ui.Dirty.companion){$s=$Snapshot.companion;$script:Ui.CompEnabled.Checked=[bool]$s.enabled;$script:Ui.NightAllowed.Checked=[bool]$s.quietDisabled;$script:Ui.DailyMax.Value=[Math]::Max(1,[Math]::Min(72,[int]$s.dailyMax));$script:Ui.CompFrequency.SelectedIndex=[Array]::IndexOf($script:Ui.FrequencyKeys,[string]$s.frequency);$script:Ui.CompVersion=$s.version;$script:Ui.QuietHint.Text="夜间免打扰：$($s.quietStart):00 至次日 $($s.quietEnd):00。未收到回复时，她会逐渐降低主动打扰频率。"}
        if(-not $script:Ui.Dirty.persona){$script:Ui.Persona.Text=[string]$Snapshot.persona;$script:Ui.PersonaVersion=$Snapshot.personaVersion}
        if(-not $script:Ui.Dirty.stream){$script:Ui.Stream.Checked=[bool]$Snapshot.streaming;$script:Ui.StreamPrevious=[bool]$Snapshot.streaming}
        if(-not $script:Ui.Dirty.group){
            $selected=if($script:Ui.SelectedGroup -ge 0 -and $script:Ui.GroupRows){$script:Ui.GroupRows[$script:Ui.SelectedGroup].key}else{''}
            $script:Ui.GroupRows=@($Snapshot.groups);$script:Ui.GroupList.Items.Clear();$newIndex=0;$i=0
            foreach($g in $script:Ui.GroupRows){$caption=if($g.alias){$g.alias+'  ·  '+$g.code}else{$g.code};[void]$script:Ui.GroupList.Items.Add($caption);if($g.key -eq $selected){$newIndex=$i};$i++}
            $script:Ui.SelectedGroup=-1
            if($script:Ui.GroupRows.Count){$script:Ui.GroupList.SelectedIndex=$newIndex}else{$script:Ui.GroupStats.Text='还没有观察到群聊。完成QQ群消息授权与群友模式绑定后，点击重新载入。'}
        }
        $s=$Snapshot.companion;$script:Ui.CompValue.Text=if(-not $s.paired){'未配对'}elseif($s.enabled){'已开启'}else{'已暂停'};$script:Ui.CompValue.ForeColor=if($s.enabled -and $s.paired){$C.Green}else{$C.Muted}
        $script:Ui.CompHint.Text="$($s.minMinutes)–$($s.maxMinutes)分钟考虑一次，每小时最多$($s.hourlyMax)条"
        $script:Ui.Overview.Text="当前模型  $($Snapshot.model)`r`n群聊参与  $(@($Snapshot.groups|Where-Object {$_.enabled}).Count) 个群已开启    ·    私聊流式回复  "+$(if($Snapshot.streaming){'开启'}else{'关闭'})+"`r`n配置保存在本机，聊天与记忆不会因重启而清空。"
        $script:Ui.Loaded=$true;$script:Ui.RestartRequired=[bool]$Snapshot.restartRequired;$script:Ui.PendingButton.Visible=$script:Ui.RestartRequired
    }finally{$script:Ui.Loading=$false}
    if(-not $script:Ui.Dirty.group){Load-SelectedGroup};Update-DirtyLabels;Refresh-Enabled
}
function Handle-Result($Job,$Reply){
    $action=$Job.Action
    if(-not $Reply.success){if(-not $Job.Quiet -or $action -eq 'Snapshot'){Notify ([string]$Reply.message) 'error'};return}
    switch($action){
        'Status'{Apply-Status $Reply.data}
        'Snapshot'{$first=-not $script:Ui.Loaded;Apply-Snapshot $Reply.data;if($first -or -not $Job.Quiet){Notify '已载入本机最新配置。' 'success'}}
        'Logs'{if($Reply.data.channel -eq $script:Ui.LogChannels[$script:Ui.LogChoice.SelectedIndex]){$text=([string]$Reply.data.text) -replace "`r?`n","`r`n";$script:Ui.LogText.Text=$text;$lastBreak=$text.LastIndexOf("`r`n");$script:Ui.LogText.SelectionStart=if($lastBreak -ge 0){$lastBreak+2}else{0};$script:Ui.LogText.ScrollToCaret()}}
        {$_ -in @('Start','Stop','Restart')}{Apply-Status $Reply.data;Notify $Reply.message 'success'}
        {$_ -in @('SaveCompanion','SaveGroup','SavePersona','SaveStreaming','SaveImages','SaveModel')}{
            $key=@{SaveCompanion='companion';SaveGroup='group';SavePersona='persona';SaveStreaming='stream';SaveImages='images';SaveModel='chatModel'}[$action];$script:Ui.Dirty[$key]=$false
            if($Reply.data.snapshot){Apply-Snapshot $Reply.data.snapshot}else{Begin-Job 'Snapshot' $null $true};Notify $Reply.message 'success'
        }
        'Backup'{$script:Ui.LastExport.Text='最近保存：'+$Reply.data.path;Notify '配置备份已保存，可点击“打开导出目录”查看。' 'success'}
        'ImageTasks'{Apply-Images $Reply.data}
        {$_ -in @('ConnectChatGPT','RefreshChatGPT','ProbeChatGPT','ConnectChatUI','ProbeChatUI','RefreshCodex','ProbeCodex','OpenCodex')}{Notify $Reply.message 'success';Begin-Job 'Snapshot' $null $true}
        {$_ -in @('CancelImage','RetryImage')}{Notify '已提交任务操作，机器人将在下一次检查时处理；已在发送中的消息可能无法撤回。' 'success';Begin-Job 'ImageTasks' $null $true}
        'ImageProbe'{Notify '已请求分享一条有配图构想、尚未发送的日记；暂停、免打扰和等待回复规则继续生效。' 'success'}
        'ImagePreview'{
            try{$stream=[IO.File]::OpenRead([string]$Reply.data.path);try{$loaded=[Drawing.Image]::FromStream($stream);try{$picture=New-Object Drawing.Bitmap($loaded)}finally{$loaded.Dispose()}}finally{$stream.Dispose()};$old=$script:Ui.ImagePicture.Image;$script:Ui.ImagePicture.Image=$picture;if($old){$old.Dispose()};Notify '图片已在右侧预览。' 'success'}catch{Notify '此图片暂不能预览，文件仍保存在本机。' 'warning'}
        }
        {$_ -in @('ReadingStatus','ReadingImport','ReadingNext','ReadingAuto')}{Apply-Reading $Reply.data;Notify $Reply.message 'success'}
        'ReadingExport'{Apply-Reading $Reply.data.snapshot;Notify ('阅读笔记已导出：'+$Reply.data.path) 'success'}
        'ExportMemory'{$script:Ui.LastExport.Text='最近保存：'+$Reply.data.path;Notify ("已导出 $($Reply.data.memoryCount) 条记忆，按 $($Reply.data.partitionCount) 个身份分区。") 'success';Begin-Job 'Status' $null $true}
    }
}
function Poll-Jobs{
    foreach($action in @($script:Ui.Jobs.Keys)){
        $job=$script:Ui.Jobs[$action];$done=$false;$reply=$null
        if(Test-Path -LiteralPath $job.Result){try{$reply=Get-Content -LiteralPath $job.Result -Raw -Encoding UTF8|ConvertFrom-Json;$done=$true}catch{}}
        elseif(([DateTime]::UtcNow-$job.Started).TotalSeconds -gt 200){$reply=[pscustomobject]@{success=$false;message='操作等待较久，可能仍在后台继续，请先刷新状态。'};$done=$true}
        else{$job.Process.Refresh();if($job.Process.HasExited){$reply=[pscustomobject]@{success=$false;message='后台操作未返回结果，请重新载入或查看日志。'};$done=$true}}
        if($done){
            $script:Ui.Jobs.Remove($action)
            if($script:Ui.Busy -eq $action){$script:Ui.Busy=$null;$script:Ui.Progress.Visible=$false}
            try{Handle-Result $job $reply}finally{foreach($path in @($job.Result,$job.Request,($job.Result+'.progress'))){if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue}};Refresh-Enabled}
        }elseif($script:Ui.Busy -eq $action -and (Test-Path -LiteralPath ($job.Result+'.progress'))){try{$progress=Get-Content -LiteralPath ($job.Result+'.progress') -Raw -Encoding UTF8|ConvertFrom-Json;Notify $progress.message}catch{}}
    }
}
function Reload-Configuration{
    $dirty=@($script:Ui.Dirty.Values|Where-Object {$_}).Count -gt 0
    if($dirty -and [Windows.Forms.MessageBox]::Show('重新载入会放弃尚未保存的修改，是否继续？','重新载入','YesNo','Question') -ne 'Yes'){return}
    foreach($key in @($script:Ui.Dirty.Keys)){$script:Ui.Dirty[$key]=$false};Update-DirtyLabels;Begin-Job 'Snapshot'
}
function Save-Companion{
    if($script:Ui.CompFrequency.SelectedIndex -lt 0){Notify '请选择主动消息频率。' 'warning';return}
    Begin-Job 'SaveCompanion' @{version=$script:Ui.CompVersion;enabled=$script:Ui.CompEnabled.Checked;quietDisabled=$script:Ui.NightAllowed.Checked;frequency=$script:Ui.FrequencyKeys[$script:Ui.CompFrequency.SelectedIndex];dailyMax=[int]$script:Ui.DailyMax.Value}
}
function Save-Group{
    if($script:Ui.SelectedGroup -lt 0){return};$g=$script:Ui.GroupRows[$script:Ui.SelectedGroup]
    Begin-Job 'SaveGroup' @{key=$g.key;version=$g.version;enabled=$script:Ui.GroupEnabled.Checked;frequency=[string]$script:Ui.GroupFrequency.SelectedItem;alias=$script:Ui.GroupAlias.Text}
}
function Save-Persona{Begin-Job 'SavePersona' @{version=$script:Ui.PersonaVersion;text=$script:Ui.Persona.Text}}
function Save-ChatModel{
    $provider=switch($script:Ui.ModelProvider.SelectedIndex){1{'codex'}2{'chatgpt-chat-work'}default{'deepseek-account'}}
    $i=$script:Ui.ModelChoice.SelectedIndex;$model=if($i -ge 0 -and $i -lt $script:Ui.ChatCatalog.Count){$script:Ui.ChatCatalog[$i].id}else{''}
    Begin-Job 'SaveModel' @{provider=$provider;model=$model;version=$script:Ui.ModelVersion}
}
function Update-ChatChoices([string]$Selected=''){
    $old=$script:Ui.Loading;$script:Ui.Loading=$true
    try{
        $script:Ui.ChatCatalog=switch($script:Ui.ModelProvider.SelectedIndex){1{@($script:Ui.PlanCatalog)}2{@([pscustomobject]@{id='browser-chat';name='Chat网页 · 当前选择的模型'})}default{@([pscustomobject]@{id=$script:Ui.DeepSeekModel;name='DeepSeek · 原有模型'})}}
        $script:Ui.ModelChoice.Items.Clear();$index=0;$i=0
        foreach($model in $script:Ui.ChatCatalog){[void]$script:Ui.ModelChoice.Items.Add($model.name+'  ·  '+$model.id);if($model.id -eq $Selected){$index=$i};$i++}
        if($script:Ui.ChatCatalog.Count){$script:Ui.ModelChoice.SelectedIndex=$index}
    }finally{$script:Ui.Loading=$old}
}
function Format-NativeTime($Milliseconds){
    if(-not $Milliseconds){return '尚无记录'}
    try{$at=[DateTimeOffset]::FromUnixTimeMilliseconds([long]$Milliseconds);return [TimeZoneInfo]::ConvertTime($at,[TimeZoneInfo]::FindSystemTimeZoneById('China Standard Time')).ToString('MM-dd HH:mm:ss')}catch{return '时间待确认'}
}
function Apply-ChatModel($Data){
    if(-not $Data){return};$old=$script:Ui.Loading;$script:Ui.Loading=$true
    try{
        $selected=if($script:Ui.ModelChoice.SelectedIndex -ge 0 -and $script:Ui.ChatCatalog.Count){$script:Ui.ChatCatalog[$script:Ui.ModelChoice.SelectedIndex].id}else{$Data.model}
        if(-not $script:Ui.Dirty.chatModel){$script:Ui.ModelProvider.SelectedIndex=switch($Data.provider){'deepseek-account'{0}'codex'{1}'chatgpt-chat-work'{2}default{0}};$script:Ui.ModelVersion=$Data.version;$selected=$Data.model}
        $script:Ui.DeepSeekModel=$Data.deepseekModel;$script:Ui.PlanCatalog=@($Data.native.models);Update-ChatChoices $selected
        $script:Ui.ModelAccount.Text=if($Data.provider -eq 'chatgpt-chat-work'){"Chat工作桥接：$(if($Data.chatUI.connected -and $Data.chatUI.work){'在线'}else{'等待专用工作标签页'})`r`n连接状态：$($Data.chatUI.status)；扩展版本：$($Data.chatUI.extensionVersion)"}elseif($Data.native.connected){"Codex账号检查通过  $(Format-NativeTime $Data.native.checkedAt)`r`n模型探针：$($Data.native.testedModel)  $(Format-NativeTime $Data.native.probeAt)"}else{'请确认Codex已登录，然后点击“刷新Codex连接”。'}
        $runtime=$Data.native.runtime
        $script:Ui.ModelRuntime.ForeColor=$C.Muted
        if($runtime.phase -eq 'error'){
            $failure=$runtime.lastFailure
            $hint=if($failure.code -eq 'CODEX_THREAD_BUSY'){'该会话正在另一窗口执行任务，请等待任务结束再发送。'}else{'本轮调用失败，可把下面的错误码和环节用于排查。'}
            $script:Ui.ModelRuntime.Text="最近QQ对话失败  $(Format-NativeTime $failure.at)`r`n$($failure.code)  ·  $($failure.method)  ·  RPC $($failure.rpcCode)`r`n$hint"
            $script:Ui.ModelRuntime.ForeColor=$C.Amber
        }elseif($runtime.lastSuccessAt){
            $script:Ui.ModelRuntime.Text="最近QQ对话完成  $(Format-NativeTime $runtime.lastSuccessAt)"+$(if($runtime.lastRecovery.at){"`r`n已保留原历史并续接会话  $(Format-NativeTime $runtime.lastRecovery.at)"}else{''})
            $script:Ui.ModelRuntime.ForeColor=$C.Green
        }elseif($runtime.phase -eq 'recovering'){$script:Ui.ModelRuntime.Text='已从被占用的会话保留历史并续接，正在等待本轮完成。'}
        else{$script:Ui.ModelRuntime.Text='尚无本次QQ对话结果。上方模型探针仅验证账号与模型，实际会话状态会显示在这里。'}
        $label=if($Data.provider -eq 'codex'){'Codex · 原生会话'}elseif($Data.provider -eq 'chatgpt-chat-work'){'Chat网页 · 无QQ上下文工作'}elseif($Data.provider -eq 'deepseek-account'){'DeepSeek'}else{'旧账号接口（可切换至原生Codex）'}
        $memoryStatus=if($Data.provider -eq 'chatgpt-chat-work'){'Chat工作路由不读取、不写入长期记忆'}else{"共享记忆：$($Data.native.memory)`r`n记忆工作目录：$($Data.native.workspace)"}
        $script:Ui.ModelCurrent.Text="当前路由：$label  ·  $($Data.model)`r`n$memoryStatus"
        $script:Ui.CodexHistory.Text="已创建 $($Data.native.threadCount) 个机器人Codex会话。`r`n"+(@($Data.native.titles) -join ' / ')
    }finally{$script:Ui.Loading=$old}
}
function Save-Images{
    Begin-Job 'SaveImages' @{version=$script:Ui.ImageVersion;enabled=$script:Ui.ImageEnabled.Checked;auto=$script:Ui.ImageAuto.Checked;characterEnabled=$script:Ui.ImageCharacter.Checked;dailyMax=[int]$script:Ui.ImageDaily.Value;minMinutes=[int]$script:Ui.ImageInterval.Value;manualDailyMax=[int]$script:Ui.ImageManual.Value;timeoutMinutes=[int]$script:Ui.ImageTimeout.Value}
}
function Update-ImageSelection{
    if(-not $script:Ui.ImageList){return};$i=$script:Ui.ImageList.SelectedIndex;$job=if($i -ge 0 -and $i -lt $script:Ui.ImageRows.Count){$script:Ui.ImageRows[$i]}else{$null}
    $script:Ui.ImageCancel.Enabled=($null -ne $job -and $job.canCancel -and -not $script:Ui.Busy)
    $script:Ui.ImageRetry.Enabled=($null -ne $job -and $job.canRetry -and -not $script:Ui.Busy)
    $script:Ui.ImagePreviewButton.Enabled=($null -ne $job -and -not $script:Ui.Busy)
    $script:Ui.ImageDetail.Text=if($job){"$($job.label)  ·  $($job.reason)`r`n正文：$($job.caption)"}else{'选择任务可查看状态与正文；未确认发送不会自动重试。'}
}
function Apply-Images($Data){
    if(-not $Data){return};$wasLoading=$script:Ui.Loading;$script:Ui.Loading=$true
    try{
        if(-not $script:Ui.Dirty.images){$s=$Data.settings;$script:Ui.ImageEnabled.Checked=[bool]$s.enabled;$script:Ui.ImageAuto.Checked=[bool]$s.auto;$script:Ui.ImageCharacter.Checked=[bool]$s.characterEnabled;$script:Ui.ImageVersion=$Data.version
            foreach($pair in @(@('ImageDaily','dailyMax'),@('ImageInterval','minMinutes'),@('ImageManual','manualDailyMax'),@('ImageTimeout','timeoutMinutes'))){$control=$script:Ui[$pair[0]];$control.Value=[Math]::Max($control.Minimum,[Math]::Min($control.Maximum,[decimal]$s.($pair[1])))}
        }
        $script:Ui.ImageInfo.Text=if(-not $Data.configured){'尚未配置生图通道。请先完成本机QQ与Codex配对。'}else{"已配对私聊  ·  待处理 $($Data.active) 个任务`r`nCodex桌面版需保持打开，文字同步开关独立。"}
        $script:Ui.CharacterInfo.Text=if($Data.characterReady){'固定形象已就绪：冬日针织装 + 蓝发圆脸。只用于柚柚自己的画面，不会套用到普通画图。'}else{'尚未配置固定形象参考图。'}
        $selected=if($script:Ui.ImageList.SelectedIndex -ge 0 -and $script:Ui.ImageRows.Count){$script:Ui.ImageRows[$script:Ui.ImageList.SelectedIndex].id}else{''}
        $script:Ui.ImageRows=@($Data.jobs);$script:Ui.ImageList.Items.Clear();$index=0;$n=0
        foreach($job in $script:Ui.ImageRows){[void]$script:Ui.ImageList.Items.Add("$($job.id.Substring(0,8))  $($job.kind) · $($job.label)");if($job.id -eq $selected){$index=$n};$n++}
        if($script:Ui.ImageRows.Count){$script:Ui.ImageList.SelectedIndex=$index};Update-ImageSelection
    }finally{$script:Ui.Loading=$wasLoading}
}

# Layout: sidebar, independent top bar, content host and unobtrusive operation footer.
$form=New-Object Windows.Forms.Form;$form.Text='柚柚机器人控制台';$form.ClientSize=New-Object Drawing.Size(1060,720);$form.MinimumSize=New-Object Drawing.Size(980,680);$form.StartPosition='CenterScreen';$form.BackColor=$C.Bg;$form.ForeColor=$C.Text;$form.Font=New-Object Drawing.Font('Microsoft YaHei UI',9);$form.KeyPreview=$true
$root=New-Object Windows.Forms.TableLayoutPanel;$root.Dock='Fill';$root.ColumnCount=2;$root.RowCount=3;$root.Margin=New-Object Windows.Forms.Padding(0)
[void]$root.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle([Windows.Forms.SizeType]::Absolute,176)));[void]$root.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle([Windows.Forms.SizeType]::Percent,100)))
foreach($style in @((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Absolute,86)),(New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Percent,100)),(New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Absolute,40)))){[void]$root.RowStyles.Add($style)};$form.Controls.Add($root)
$side=New-Object Windows.Forms.Panel;$side.Dock='Fill';$side.Margin=New-Object Windows.Forms.Padding(0);$side.BackColor=$C.Side;$side.Padding=New-Object Windows.Forms.Padding(14,24,14,16);$root.Controls.Add($side,0,0);$root.SetRowSpan($side,3)
$sideStack=Stack-Panel;$side.Controls.Add($sideStack)
$brand=Text-Line '柚柚' 23 $true 46;$brand.ForeColor=$C.Green;Stack-Add $sideStack $brand 0
$brandHint=Text-Line '机器人控制台  2.6.0' 9 $false 38;$brandHint.ForeColor=$C.Muted;Stack-Add $sideStack $brandHint 20
foreach($entry in @(@('home','概览'),@('models','对话模型'),@('companion','主动消息'),@('group','群聊设置'),@('persona','人设与回复'),@('images','生图与形象'),@('reading','阅读书房'),@('logs','运行日志'),@('tools','备份与导出'))){$button=Action-Button $entry[1];$button.Tag=$entry[0];$button.TextAlign='MiddleLeft';$button.Padding=New-Object Windows.Forms.Padding(12,0,0,0);$button.Height=45;$button.Add_Click({param($sender,$eventArgs) Show-Page ([string]$sender.Tag)});Stack-Add $sideStack $button 6;$script:Ui.Nav[$entry[0]]=$button}
$sideFoot=Text-Line "本机配置 · 独立记忆`r`nQQ / DSH / Hy Memory" 8 $false 48;$sideFoot.Dock='Bottom';$sideFoot.ForeColor=$C.Muted;$side.Controls.Add($sideFoot)
$top=New-Object Windows.Forms.TableLayoutPanel;$top.Dock='Fill';$top.ColumnCount=3;$top.RowCount=2;$top.Padding=New-Object Windows.Forms.Padding(24,16,20,8);$top.Margin=New-Object Windows.Forms.Padding(0)
[void]$top.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle([Windows.Forms.SizeType]::Percent,100)));[void]$top.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle([Windows.Forms.SizeType]::Absolute,145)));[void]$top.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle([Windows.Forms.SizeType]::Absolute,145)))
$script:Ui.Title=Text-Line '概览' 18 $true 34;$script:Ui.Subtitle=Text-Line '' 9 $false 26;$script:Ui.Subtitle.ForeColor=$C.Muted;$top.Controls.Add($script:Ui.Title,0,0);$top.Controls.Add($script:Ui.Subtitle,0,1)
$script:Ui.StatusPill=Text-Line '正在检查…' 9 $true 36;$script:Ui.StatusPill.TextAlign='MiddleRight';$top.Controls.Add($script:Ui.StatusPill,1,0);$top.SetRowSpan($script:Ui.StatusPill,2)
$script:Ui.PendingButton=Action-Button '重启以应用设置' 'normal' 140;$script:Ui.PendingButton.ForeColor=$C.Amber;$script:Ui.PendingButton.Visible=$false;$script:Ui.PendingButton.Add_Click({Begin-Job 'Restart'});$top.Controls.Add($script:Ui.PendingButton,2,0);$top.SetRowSpan($script:Ui.PendingButton,2);$root.Controls.Add($top,1,0)
$content=New-Object Windows.Forms.Panel;$content.Dock='Fill';$content.Margin=New-Object Windows.Forms.Padding(0);$root.Controls.Add($content,1,1)
$footer=New-Object Windows.Forms.TableLayoutPanel;$footer.Dock='Fill';$footer.ColumnCount=2;$footer.RowCount=1;$footer.Margin=New-Object Windows.Forms.Padding(0);$footer.Padding=New-Object Windows.Forms.Padding(24,0,22,0)
[void]$footer.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle([Windows.Forms.SizeType]::Percent,100)));[void]$footer.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle([Windows.Forms.SizeType]::Absolute,100)))
$script:Ui.Footer=Text-Line '正在载入本机配置…' 9 $false 34;$script:Ui.Footer.TextAlign='MiddleLeft';$footer.Controls.Add($script:Ui.Footer,0,0)
$script:Ui.Progress=New-Object Windows.Forms.ProgressBar;$script:Ui.Progress.Style='Marquee';$script:Ui.Progress.Height=7;$script:Ui.Progress.Dock='Bottom';$script:Ui.Progress.Visible=$false;$footer.Controls.Add($script:Ui.Progress,1,0);$root.Controls.Add($footer,1,2)
function Page([string]$Key,[bool]$Scroll=$true){$p=New-Object Windows.Forms.Panel;$p.Dock='Fill';$p.Padding=New-Object Windows.Forms.Padding(24,12,24,12);$p.AutoScroll=$Scroll;$p.Visible=$false;$content.Controls.Add($p);$script:Ui.Pages[$Key]=$p;return $p}

# Overview
$homePage=Page 'home';$homeStack=Stack-Panel;$homePage.Controls.Add($homeStack)
$cards=New-Object Windows.Forms.TableLayoutPanel;$cards.ColumnCount=3;$cards.RowCount=1;$cards.AutoSize=$true;$cards.Dock='Top'
foreach($n in 1..3){[void]$cards.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle([Windows.Forms.SizeType]::Percent,(100/3))))}
$i=0;foreach($entry in @(@('Qq','QQ聊天'),@('Memory','长期记忆'),@('Comp','主动分享'))){$card=Card $entry[1];$value=Text-Line '读取中' 20 $true 45;$detail=Text-Line '' 8 $false 46;$detail.ForeColor=$C.Muted;Stack-Add $card.Body $value 4;Stack-Add $card.Body $detail 0;$card.Panel.Dock='Fill';$card.Panel.Margin=New-Object Windows.Forms.Padding(0,0,10,0);$cards.Controls.Add($card.Panel,$i,0);$script:Ui[($entry[0]+'Value')]=$value;$script:Ui[($entry[0]+'Hint')]=$detail;$i++};Stack-Add $homeStack $cards 20
$actions=Flow-Actions
foreach($entry in @(@('Start','启动机器人','primary'),@('Stop','关闭机器人','danger'),@('Restart','重启机器人','normal'))){$b=Action-Button $entry[1] $entry[2] 136;$b.Tag=$entry[0];$b.Add_Click({param($sender,$eventArgs) Begin-Job ([string]$sender.Tag)});$actions.Controls.Add($b);$script:Ui.ServiceButtons+=,$b}
$refresh=Action-Button '刷新状态' 'normal' 112;$refresh.Add_Click({Begin-Job 'Status'});$actions.Controls.Add($refresh)
$reloadHome=Action-Button '载入配置' 'normal' 112;$reloadHome.Add_Click({Reload-Configuration});$actions.Controls.Add($reloadHome);Stack-Add $homeStack $actions 4
$script:Ui.LastCheck=Text-Line '状态在后台自动更新' 8 $false 30;$script:Ui.LastCheck.ForeColor=$C.Muted;Stack-Add $homeStack $script:Ui.LastCheck 12
$overview=Card '当前配置' '常用设置都可以在左侧页面查看和调整。';$script:Ui.Overview=Text-Line '正在载入…' 9 $false 84;$script:Ui.Overview.ForeColor=$C.Muted;Stack-Add $overview.Body $script:Ui.Overview 0;Stack-Add $homeStack $overview.Panel 12
$note=Text-Line '启停在后台完成。关闭控制台窗口会保留机器人当前的运行状态。' 9 $false 42;$note.ForeColor=$C.Muted;Stack-Add $homeStack $note

# Reader: local import, durable progress and grounded reflection.
$readingPage=Page 'reading';$readingStack=Stack-Panel;$readingPage.Controls.Add($readingStack)
$bookCard=Card '书架与阅读进度' '每次最多2400字符的新原文，默认每45分钟续读一段。只有笔记和出处核对、保存后才推进书签。'
$script:Ui.ReadingBooks=New-Object Windows.Forms.ListBox;$script:Ui.ReadingBooks.Height=85;$script:Ui.ReadingBooks.BackColor=$C.Input;$script:Ui.ReadingBooks.ForeColor=$C.Text;$script:Ui.ReadingBooks.BorderStyle='None';Stack-Add $bookCard.Body $script:Ui.ReadingBooks 8
$script:Ui.ReadingSummary=Text-Line '正在载入书架…' 9 $false 88;Stack-Add $bookCard.Body $script:Ui.ReadingSummary 6
$flow=Flow-Actions
$readNext=Action-Button '继续读下一段' 'primary' 140;$readNext.Add_Click({$id='';if($script:Ui.ReadingBooks.SelectedIndex -ge 0){$id=$script:Ui.ReadingRows[$script:Ui.ReadingBooks.SelectedIndex].book};Begin-Job 'ReadingNext' @{book=$id}});$flow.Controls.Add($readNext)
$pauseReading=Action-Button '暂停自动阅读' 'normal' 140;$pauseReading.Add_Click({Begin-Job 'ReadingAuto' @{enabled=$false}});$flow.Controls.Add($pauseReading)
$resumeReading=Action-Button '恢复自动阅读' 'normal' 140;$resumeReading.Add_Click({Begin-Job 'ReadingAuto' @{enabled=$true}});$flow.Controls.Add($resumeReading)
$refreshReading=Action-Button '刷新书架' 'normal' 108;$refreshReading.Add_Click({Begin-Job 'ReadingStatus' $null $true});$flow.Controls.Add($refreshReading);Stack-Add $bookCard.Body $flow 0;Stack-Add $readingStack $bookCard.Panel
$importCard=Card '添加一本书' '支持文字型PDF、TXT、Markdown。扫描正文需要OCR，提取失败不会跳过或假装读完。书籍仅加入已配对私聊的书架。'
$script:Ui.ReadingFile=Input-Field;$script:Ui.ReadingFile.ReadOnly=$true;Field-Row $importCard.Body '本机书籍文件' $script:Ui.ReadingFile
$script:Ui.ReadingTitle=Input-Field;Field-Row $importCard.Body '书名' $script:Ui.ReadingTitle
$script:Ui.ReadingAuthor=Input-Field;Field-Row $importCard.Body '作者（可留空）' $script:Ui.ReadingAuthor
$script:Ui.ReadingCover=Check-Field '我已查看，PDF第1页仅是无文字层的封面';Stack-Add $importCard.Body $script:Ui.ReadingCover 4
$flow=Flow-Actions
$chooseBook=Action-Button '选择文件' 'normal' 120;$chooseBook.Add_Click({$dialog=New-Object Windows.Forms.OpenFileDialog;$dialog.Filter='书籍|*.pdf;*.txt;*.md';if($dialog.ShowDialog() -eq 'OK'){$script:Ui.ReadingFile.Text=$dialog.FileName;if(-not $script:Ui.ReadingTitle.Text){$script:Ui.ReadingTitle.Text=([IO.Path]::GetFileNameWithoutExtension($dialog.FileName) -replace '\s*[（(].*$','')}};$dialog.Dispose()});$flow.Controls.Add($chooseBook)
$importBook=Action-Button '导入书架' 'primary' 120;$importBook.Add_Click({Begin-Job 'ReadingImport' @{file=$script:Ui.ReadingFile.Text;title=$script:Ui.ReadingTitle.Text;author=$script:Ui.ReadingAuthor.Text;coverReviewed=$script:Ui.ReadingCover.Checked}});$flow.Controls.Add($importBook)
$openReading=Action-Button '打开阅读文件夹' 'normal' 150;$openReading.Add_Click({Start-Process explorer.exe -ArgumentList ('"'+(Join-Path $Project 'data\reading-workspace')+'"')});$flow.Controls.Add($openReading);Stack-Add $importCard.Body $flow 0;Stack-Add $readingStack $importCard.Panel
$notesCard=Card '最近感悟与前文理解' '全部逐段笔记永久保留；读到后文可修正早先理解，旧感悟不会被覆盖。分享仍遵守主动消息开关、安静时段和等待回复规则。'
$script:Ui.ReadingNotes=New-Object Windows.Forms.TextBox;$script:Ui.ReadingNotes.Multiline=$true;$script:Ui.ReadingNotes.ReadOnly=$true;$script:Ui.ReadingNotes.ScrollBars='Vertical';$script:Ui.ReadingNotes.Height=300;$script:Ui.ReadingNotes.BackColor=$C.Input;$script:Ui.ReadingNotes.ForeColor=$C.Text;Stack-Add $notesCard.Body $script:Ui.ReadingNotes 8
$exportReading=Action-Button '导出全部阅读笔记' 'normal' 175;$exportReading.Add_Click({Begin-Job 'ReadingExport'});Stack-Add $notesCard.Body $exportReading 0;Stack-Add $readingStack $notesCard.Panel

# Native Codex and original DeepSeek share the same memory service.
$modelsPage=Page 'models';$modelsStack=Stack-Panel;$modelsPage.Controls.Add($modelsStack)
$accountCard=Card 'Codex 原生连接' '使用本机Codex已登录的账号，聊天会保存到Codex软件的历史列表。仍适用账号本身的额度。'
$script:Ui.ModelAccount=Text-Line '正在载入…' 10 $false 60;Stack-Add $accountCard.Body $script:Ui.ModelAccount 6
$script:Ui.ModelRuntime=Text-Line '' 9 $false 84;Stack-Add $accountCard.Body $script:Ui.ModelRuntime 6
$flow=Flow-Actions
$refreshModels=Action-Button '刷新Codex连接' 'normal' 168;$refreshModels.Add_Click({Begin-Job 'RefreshCodex'});$flow.Controls.Add($refreshModels)
$openCodex=Action-Button '在Codex查看聊天' 'normal' 168;$openCodex.Add_Click({Begin-Job 'OpenCodex'});$flow.Controls.Add($openCodex);Stack-Add $accountCard.Body $flow 8
$script:Ui.CodexHistory=Text-Line '' 9 $false 65;$script:Ui.CodexHistory.ForeColor=$C.Muted;Stack-Add $accountCard.Body $script:Ui.CodexHistory 0;Stack-Add $modelsStack $accountCard.Panel
$modelCard=Card '对话路由与共享记忆' '同一QQ身份在两条路由中共享Hy Memory；私聊和各个群继续隔离。切换不会搬动、清空或复制记忆。'
$script:Ui.ModelProvider=Choice-Field @('DeepSeek · 原本路由','Codex · 原生会话','Chat网页 · 无QQ上下文工作');Field-Row $modelCard.Body '对话路由' $script:Ui.ModelProvider
$script:Ui.ModelChoice=Choice-Field @();Field-Row $modelCard.Body '模型' $script:Ui.ModelChoice 'Chat工作通道只提交当前QQ任务与附件，不读取柚柚记忆；文件可双向传递。它使用专用Chat工作标签页。'
$flow=Flow-Actions;$testModel=Action-Button '验证所选模型' 'normal' 156;$testModel.Add_Click({
    $i=$script:Ui.ModelChoice.SelectedIndex
    if($script:Ui.ModelProvider.SelectedIndex -eq 1){
        if($i -ge 0){Begin-Job 'ProbeCodex' @{model=$script:Ui.ChatCatalog[$i].id}}else{Notify '请先刷新Codex连接。' 'warning'}
    }elseif($script:Ui.ModelProvider.SelectedIndex -eq 2){Begin-Job 'ProbeChatUI'}else{Notify 'DeepSeek沿用已有账号连接。'}
});$flow.Controls.Add($testModel)
$modelSave=Save-Button '切换对话路由';$modelSave.Add_Click({Save-ChatModel});$flow.Controls.Add($modelSave);Stack-Add $modelCard.Body $flow 6
$script:Ui.ModelCurrent=Text-Line '' 9 $false 102;$script:Ui.ModelCurrent.ForeColor=$C.Muted;Stack-Add $modelCard.Body $script:Ui.ModelCurrent 0;Stack-Add $modelsStack $modelCard.Panel
$script:Ui.ModelProvider.Add_SelectedIndexChanged({if(-not $script:Ui.Loading){Update-ChatChoices};Mark-Dirty 'chatModel'});$script:Ui.ModelChoice.Add_SelectedIndexChanged({Mark-Dirty 'chatModel'})

# Proactive messages
$compPage=Page 'companion';$compStack=Stack-Panel;$compPage.Controls.Add($compStack)
$compCard=Card '主动分享' '只向已经配对的私聊发送。频率是考虑分享的节奏，并非固定推送。'
$script:Ui.CompEnabled=Check-Field '允许柚柚主动分享日常';Stack-Add $compCard.Body $script:Ui.CompEnabled 10
$script:Ui.FrequencyKeys=@('high','normal','light','custom');$script:Ui.CompFrequency=Choice-Field @('高频 · 20–30分钟考虑，最多3条/小时','正常 · 60–120分钟考虑，最多1条/小时','轻量 · 3–6小时考虑，最多1条/小时','自定义 · 保留目前的间隔与小时上限');Field-Row $compCard.Body '分享节奏' $script:Ui.CompFrequency
$script:Ui.DailyMax=New-Object Windows.Forms.NumericUpDown;$script:Ui.DailyMax.Minimum=1;$script:Ui.DailyMax.Maximum=72;$script:Ui.DailyMax.Value=42;$script:Ui.DailyMax.BackColor=$C.Input;$script:Ui.DailyMax.ForeColor=$C.Text;$script:Ui.DailyMax.Width=110;$script:Ui.EditControls+=,$script:Ui.DailyMax;Field-Row $compCard.Body '每天最多分享多少条' $script:Ui.DailyMax
$script:Ui.NightAllowed=Check-Field '允许夜间主动分享';Stack-Add $compCard.Body $script:Ui.NightAllowed 2
$script:Ui.QuietHint=Text-Line '' 9 $false 48;$script:Ui.QuietHint.ForeColor=$C.Muted;Stack-Add $compCard.Body $script:Ui.QuietHint 2
$flow=Flow-Actions;$save=Save-Button '保存主动消息';$save.Add_Click({Save-Companion});$flow.Controls.Add($save);$reload=Action-Button '重新载入';$reload.Add_Click({Reload-Configuration});$flow.Controls.Add($reload);Stack-Add $compCard.Body $flow 0;Stack-Add $compStack $compCard.Panel
$script:Ui.CompEnabled.Add_CheckedChanged({Mark-Dirty 'companion'});$script:Ui.CompFrequency.Add_SelectedIndexChanged({Mark-Dirty 'companion'});$script:Ui.DailyMax.Add_ValueChanged({Mark-Dirty 'companion'});$script:Ui.NightAllowed.Add_CheckedChanged({Mark-Dirty 'companion'})

# Per-group settings
$groupPage=Page 'group' $false;$groupGrid=New-Object Windows.Forms.TableLayoutPanel;$groupGrid.Dock='Fill';$groupGrid.ColumnCount=2;$groupGrid.RowCount=1
[void]$groupGrid.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle([Windows.Forms.SizeType]::Absolute,205)));[void]$groupGrid.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle([Windows.Forms.SizeType]::Percent,100)));$groupPage.Controls.Add($groupGrid)
$listCard=New-Object Windows.Forms.Panel;$listCard.Dock='Fill';$listCard.BackColor=$C.Card;$listCard.Padding=New-Object Windows.Forms.Padding(12);$listCard.Margin=New-Object Windows.Forms.Padding(0,0,14,0)
$listTitle=Text-Line '已观察到的群聊' 10 $true 34;$script:Ui.GroupList=New-Object Windows.Forms.ListBox;$script:Ui.GroupList.Dock='Fill';$script:Ui.GroupList.BorderStyle='None';$script:Ui.GroupList.BackColor=$C.Card;$script:Ui.GroupList.ForeColor=$C.Text;$script:Ui.GroupList.IntegralHeight=$false;$script:Ui.GroupList.ItemHeight=30;$script:Ui.EditControls+=,$script:Ui.GroupList;$listCard.Controls.Add($script:Ui.GroupList);$listCard.Controls.Add($listTitle);$groupGrid.Controls.Add($listCard,0,0)
$groupRight=New-Object Windows.Forms.Panel;$groupRight.Dock='Fill';$groupRight.AutoScroll=$true;$groupGrid.Controls.Add($groupRight,1,0);$groupStack=Stack-Panel;$groupRight.Controls.Add($groupStack)
$groupCard=Card '群里的柚柚' '备注仅在本机控制台显示。接收群消息仍需要QQ平台授权。'
$script:Ui.GroupEnabled=Check-Field '开启群友模式，允许她参与普通群聊';Stack-Add $groupCard.Body $script:Ui.GroupEnabled 8
$script:Ui.GroupAlias=Input-Field;$script:Ui.GroupAlias.MaxLength=40;Field-Row $groupCard.Body '本机群备注' $script:Ui.GroupAlias
$script:Ui.GroupFrequency=Choice-Field @('安静','正常','活跃');Field-Row $groupCard.Body '普通插话频率' $script:Ui.GroupFrequency '安静：每小时最多4条；正常12条；活跃24条。成员直接叫她另行排队。'
$script:Ui.GroupStats=Text-Line '请选择左侧群聊' 9 $false 76;$script:Ui.GroupStats.ForeColor=$C.Muted;Stack-Add $groupCard.Body $script:Ui.GroupStats 6
$flow=Flow-Actions;$script:Ui.GroupSave=Save-Button '保存本群设置';$script:Ui.GroupSave.Add_Click({Save-Group});$flow.Controls.Add($script:Ui.GroupSave);$reload=Action-Button '重新载入' 'normal' 116;$reload.Add_Click({Reload-Configuration});$flow.Controls.Add($reload);Stack-Add $groupCard.Body $flow 0;Stack-Add $groupStack $groupCard.Panel
$script:Ui.GroupRows=@();$script:Ui.GroupList.Add_SelectedIndexChanged({
    if($script:Ui.Loading){return};$new=$script:Ui.GroupList.SelectedIndex
    if($script:Ui.Dirty.group -and $new -ne $script:Ui.SelectedGroup){if([Windows.Forms.MessageBox]::Show('这个群的修改尚未保存，仍然切换群聊吗？','未保存的修改','YesNo','Question') -ne 'Yes'){$script:Ui.Loading=$true;$script:Ui.GroupList.SelectedIndex=$script:Ui.SelectedGroup;$script:Ui.Loading=$false;return}}
    Load-SelectedGroup
});$script:Ui.GroupEnabled.Add_CheckedChanged({Mark-Dirty 'group'});$script:Ui.GroupAlias.Add_TextChanged({Mark-Dirty 'group'});$script:Ui.GroupFrequency.Add_SelectedIndexChanged({Mark-Dirty 'group'})

# Persona and reply display
$personaPage=Page 'persona' $false;$personaGrid=New-Object Windows.Forms.TableLayoutPanel;$personaGrid.Dock='Fill';$personaGrid.ColumnCount=1;$personaGrid.RowCount=2
[void]$personaGrid.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle([Windows.Forms.SizeType]::Percent,100)));[void]$personaGrid.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::AutoSize)));[void]$personaGrid.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Percent,100)));$personaPage.Controls.Add($personaGrid)
$streamCard=Card '回复显示方式';$streamFlow=Flow-Actions;$script:Ui.Stream=Check-Field '私聊回复逐步显示';$script:Ui.Stream.Width=250;$script:Ui.Stream.Dock='None';$streamFlow.Controls.Add($script:Ui.Stream);$streamSave=Save-Button '保存回复方式';$streamSave.Add_Click({Begin-Job 'SaveStreaming' @{enabled=$script:Ui.Stream.Checked;previous=$script:Ui.StreamPrevious}});$streamFlow.Controls.Add($streamSave);Stack-Add $streamCard.Body $streamFlow 0;$personaGrid.Controls.Add($streamCard.Panel,0,0);$streamCard.Panel.Margin=New-Object Windows.Forms.Padding(0,0,0,12)
$editor=New-Object Windows.Forms.TableLayoutPanel;$editor.Dock='Fill';$editor.BackColor=$C.Card;$editor.Padding=New-Object Windows.Forms.Padding(18);$editor.ColumnCount=1;$editor.RowCount=4
[void]$editor.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle([Windows.Forms.SizeType]::Percent,100)));foreach($style in @((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Absolute,32)),(New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Absolute,38)),(New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Percent,100)),(New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Absolute,52)))){[void]$editor.RowStyles.Add($style)}
$editor.Controls.Add((Text-Line '人格与交流风格' 11 $true 30),0,0);$hint=Text-Line '保存到私聊和群聊配置；重启后完全生效。支持 Ctrl+S 保存。' 9 $false 32;$hint.ForeColor=$C.Muted;$editor.Controls.Add($hint,0,1)
$script:Ui.Persona=Input-Field;$script:Ui.Persona.Multiline=$true;$script:Ui.Persona.AcceptsReturn=$true;$script:Ui.Persona.AcceptsTab=$true;$script:Ui.Persona.ScrollBars='Vertical';$script:Ui.Persona.Dock='Fill';$script:Ui.Persona.Font=New-Object Drawing.Font('Microsoft YaHei UI',10);$editor.Controls.Add($script:Ui.Persona,0,2)
$flow=Flow-Actions;$flow.Padding=New-Object Windows.Forms.Padding(0,10,0,0);$personaSave=Save-Button '保存人设';$personaSave.Add_Click({Save-Persona});$flow.Controls.Add($personaSave);$reload=Action-Button '重新载入';$reload.Add_Click({Reload-Configuration});$flow.Controls.Add($reload);$script:Ui.PersonaCount=Text-Line '' 8 $false 35;$script:Ui.PersonaCount.Width=130;$script:Ui.PersonaCount.ForeColor=$C.Muted;$flow.Controls.Add($script:Ui.PersonaCount);$editor.Controls.Add($flow,0,3);$personaGrid.Controls.Add($editor,0,1)
$script:Ui.Stream.Add_CheckedChanged({Mark-Dirty 'stream'});$script:Ui.Persona.Add_TextChanged({$script:Ui.PersonaCount.Text=([string]$script:Ui.Persona.TextLength)+' 字';Mark-Dirty 'persona'})

# Native image generation and protected character appearance
$imagesPage=Page 'images' $false;$imageGrid=New-Object Windows.Forms.TableLayoutPanel;$imageGrid.Dock='Fill';$imageGrid.ColumnCount=2;$imageGrid.RowCount=1
[void]$imageGrid.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle([Windows.Forms.SizeType]::Percent,44)));[void]$imageGrid.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle([Windows.Forms.SizeType]::Percent,56)));$imagesPage.Controls.Add($imageGrid)
$imageLeft=New-Object Windows.Forms.Panel;$imageLeft.Dock='Fill';$imageLeft.AutoScroll=$true;$imageLeft.Margin=New-Object Windows.Forms.Padding(0,0,12,0);$imageGrid.Controls.Add($imageLeft,0,0);$imageSettings=Stack-Panel;$imageLeft.Controls.Add($imageSettings)
$imageCard=Card '配图节奏' '只向已配对私聊发送。暂停主动消息与免打扰继续生效。'
$script:Ui.ImageEnabled=Check-Field '开启 Codex 内置生图';Stack-Add $imageCard.Body $script:Ui.ImageEnabled 0
$script:Ui.ImageAuto=Check-Field '允许柚柚自行决定日常配图';Stack-Add $imageCard.Body $script:Ui.ImageAuto 0
$script:Ui.ImageCharacter=Check-Field '使用固定形象参考图';Stack-Add $imageCard.Body $script:Ui.ImageCharacter 6
foreach($entry in @(@('ImageInterval','日常配图最短间隔 / 分钟',20,1440),@('ImageDaily','日常配图每天上限 / 张',1,24),@('ImageManual','手动画图每天上限 / 张',1,100),@('ImageTimeout','等待生成超时 / 分钟',5,120))){$number=New-Object Windows.Forms.NumericUpDown;$number.Minimum=$entry[2];$number.Maximum=$entry[3];$number.Dock='Top';$number.BackColor=$C.Input;$number.ForeColor=$C.Text;$script:Ui[$entry[0]]=$number;$script:Ui.EditControls+=,$number;Field-Row $imageCard.Body $entry[1] $number;$number.Add_ValueChanged({Mark-Dirty 'images'})}
$flow=Flow-Actions;$imageSave=Save-Button '保存生图设置';$imageSave.Add_Click({Save-Images});$flow.Controls.Add($imageSave);$probe=Action-Button '分享一条日常配图' 'normal' 156;$probe.Add_Click({Begin-Job 'ImageProbe'});$flow.Controls.Add($probe);Stack-Add $imageCard.Body $flow 0
$script:Ui.ImageInfo=Text-Line '正在载入…' 8 $false 62;$script:Ui.ImageInfo.ForeColor=$C.Muted;Stack-Add $imageCard.Body $script:Ui.ImageInfo 0;Stack-Add $imageSettings $imageCard.Panel
$script:Ui.CharacterInfo=Text-Line '' 9 $false 84;$script:Ui.CharacterInfo.ForeColor=$C.Muted;Stack-Add $imageSettings $script:Ui.CharacterInfo 0
foreach($control in @($script:Ui.ImageEnabled,$script:Ui.ImageAuto,$script:Ui.ImageCharacter)){$control.Add_CheckedChanged({Mark-Dirty 'images'})}
$imageRight=New-Object Windows.Forms.Panel;$imageRight.Dock='Fill';$imageRight.AutoScroll=$true;$imageGrid.Controls.Add($imageRight,1,0);$imageStack=Stack-Panel;$imageRight.Controls.Add($imageStack)
$taskCard=Card '最近生图任务' '状态与QQ接口回执每7秒刷新；不表示对方设备已读。'
$script:Ui.ImageList=New-Object Windows.Forms.ListBox;$script:Ui.ImageList.Height=134;$script:Ui.ImageList.Dock='Top';$script:Ui.ImageList.BackColor=$C.Input;$script:Ui.ImageList.ForeColor=$C.Text;$script:Ui.ImageList.BorderStyle='None';$script:Ui.ImageList.IntegralHeight=$false;Stack-Add $taskCard.Body $script:Ui.ImageList 8
$script:Ui.ImageDetail=Text-Line '' 8 $false 76;$script:Ui.ImageDetail.ForeColor=$C.Muted;Stack-Add $taskCard.Body $script:Ui.ImageDetail 2
$flow=Flow-Actions;$script:Ui.ImagePreviewButton=Action-Button '预览' 'normal' 68;$script:Ui.ImagePreviewButton.Add_Click({$i=$script:Ui.ImageList.SelectedIndex;if($i -ge 0){Begin-Job 'ImagePreview' @{id=$script:Ui.ImageRows[$i].id}}});$flow.Controls.Add($script:Ui.ImagePreviewButton)
$script:Ui.ImageCancel=Action-Button '取消' 'normal' 68;$script:Ui.ImageCancel.Add_Click({$i=$script:Ui.ImageList.SelectedIndex;if($i -ge 0){Begin-Job 'CancelImage' @{id=$script:Ui.ImageRows[$i].id}}});$flow.Controls.Add($script:Ui.ImageCancel)
$script:Ui.ImageRetry=Action-Button '重发' 'normal' 68;$script:Ui.ImageRetry.Add_Click({$i=$script:Ui.ImageList.SelectedIndex;if($i -ge 0 -and [Windows.Forms.MessageBox]::Show('QQ未确认不等于未送达。请先查看私聊；继续可能重复发送图片。确定重发吗？','重发图片','YesNo','Warning') -eq 'Yes'){Begin-Job 'RetryImage' @{id=$script:Ui.ImageRows[$i].id;confirmed=$true}}});$flow.Controls.Add($script:Ui.ImageRetry)
$refreshImages=Action-Button '刷新' 'normal' 68;$refreshImages.Add_Click({Begin-Job 'ImageTasks'});$flow.Controls.Add($refreshImages);Stack-Add $taskCard.Body $flow 0;Stack-Add $imageStack $taskCard.Panel
$pictureCard=Card '图片预览';$script:Ui.ImagePicture=New-Object Windows.Forms.PictureBox;$script:Ui.ImagePicture.Height=230;$script:Ui.ImagePicture.Dock='Top';$script:Ui.ImagePicture.SizeMode='Zoom';$script:Ui.ImagePicture.BackColor=[Drawing.Color]::White;Stack-Add $pictureCard.Body $script:Ui.ImagePicture 8
$showCharacter=Action-Button '查看固定形象' 'normal' 142;$showCharacter.Add_Click({Begin-Job 'ImagePreview' @{id='character'}});Stack-Add $pictureCard.Body $showCharacter 0;Stack-Add $imageStack $pictureCard.Panel
$script:Ui.ImageList.Add_SelectedIndexChanged({Update-ImageSelection})

# Bounded, credential-redacted log viewer
$logsPage=Page 'logs' $false;$logsGrid=New-Object Windows.Forms.TableLayoutPanel;$logsGrid.Dock='Fill';$logsGrid.ColumnCount=1;$logsGrid.RowCount=2
[void]$logsGrid.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle([Windows.Forms.SizeType]::Percent,100)));[void]$logsGrid.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Absolute,54)));[void]$logsGrid.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Percent,100)));$logsPage.Controls.Add($logsGrid)
$logActions=Flow-Actions;$script:Ui.LogChoice=New-Object Windows.Forms.ComboBox;$script:Ui.LogChoice.DropDownStyle='DropDownList';$script:Ui.LogChoice.FlatStyle='Flat';$script:Ui.LogChoice.Width=150;$script:Ui.LogChoice.Items.AddRange(@('机器人输出','机器人错误','记忆服务错误','记忆服务输出'));$script:Ui.LogChoice.SelectedIndex=0;$script:Ui.LogChoice.BackColor=$C.Input;$script:Ui.LogChoice.ForeColor=$C.Text;$script:Ui.LogChannels=@('qq-out','qq-error','memory-error','memory-out');$logActions.Controls.Add($script:Ui.LogChoice)
$logRefresh=Action-Button '刷新' 'normal' 78;$logRefresh.Add_Click({Begin-Job 'Logs' @{channel=$script:Ui.LogChannels[$script:Ui.LogChoice.SelectedIndex]}});$logActions.Controls.Add($logRefresh)
$logCopy=Action-Button '复制' 'normal' 78;$logCopy.Add_Click({if($script:Ui.LogText.Text){[Windows.Forms.Clipboard]::SetText($script:Ui.LogText.Text);Notify '已复制当前显示的日志。' 'success'}});$logActions.Controls.Add($logCopy)
$script:Ui.AutoLogs=New-Object Windows.Forms.CheckBox;$script:Ui.AutoLogs.Text='自动刷新';$script:Ui.AutoLogs.Checked=$true;$script:Ui.AutoLogs.ForeColor=$C.Muted;$script:Ui.AutoLogs.Width=100;$script:Ui.AutoLogs.Height=34;$logActions.Controls.Add($script:Ui.AutoLogs);$logsGrid.Controls.Add($logActions,0,0)
$script:Ui.LogText=New-Object Windows.Forms.TextBox;$script:Ui.LogText.Multiline=$true;$script:Ui.LogText.ReadOnly=$true;$script:Ui.LogText.WordWrap=$false;$script:Ui.LogText.ScrollBars='Both';$script:Ui.LogText.Dock='Fill';$script:Ui.LogText.BackColor=$C.Card;$script:Ui.LogText.ForeColor=$C.Text;$script:Ui.LogText.Font=New-Object Drawing.Font('Consolas',10);$script:Ui.LogText.BorderStyle='None';$logsGrid.Controls.Add($script:Ui.LogText,0,1)
$script:Ui.LogChoice.Add_SelectedIndexChanged({Begin-Job 'Logs' @{channel=$script:Ui.LogChannels[$script:Ui.LogChoice.SelectedIndex]} $true})

# Local backups and memory JSON export
$toolsPage=Page 'tools';$toolsStack=Stack-Panel;$toolsPage.Controls.Add($toolsStack)
$backupCard=Card '配置备份' '保存人设、主动消息、群设置与本机备注。备份不包含Secret、Token、DSH登录或记忆数据库。'
$script:Ui.BackupButton=Action-Button '保存配置备份' 'primary' 160;$script:Ui.BackupButton.Add_Click({Begin-Job 'Backup'});Stack-Add $backupCard.Body $script:Ui.BackupButton 0;Stack-Add $toolsStack $backupCard.Panel 16
$exportCard=Card '长期记忆 JSON' '导出已保存的真实用户事实与偏好，按身份分区。导出会短暂停止服务，完成后恢复；角色生活记忆不在这个JSON里。'
$script:Ui.ExportButton=Action-Button '导出记忆 JSON…' 'normal' 174;$script:Ui.ExportButton.Add_Click({if([Windows.Forms.MessageBox]::Show('导出需要短暂停止机器人与记忆服务，完成后恢复运行。现在导出吗？','导出长期记忆','YesNo','Question') -eq 'Yes'){Begin-Job 'ExportMemory'}});Stack-Add $exportCard.Body $script:Ui.ExportButton 0;Stack-Add $toolsStack $exportCard.Panel 16
$folder=Action-Button '打开导出目录' 'normal' 160;$folder.Add_Click({$path=Join-Path $Project 'exports';New-Item -ItemType Directory -Force -Path $path|Out-Null;Start-Process explorer.exe ('"'+$path+'"')});Stack-Add $toolsStack $folder 12
$script:Ui.LastExport=Text-Line '备份仅保存在本机。身份分区信息也属于私人资料，请自行保管。' 9 $false 64;$script:Ui.LastExport.ForeColor=$C.Muted;Stack-Add $toolsStack $script:Ui.LastExport

$form.Add_KeyDown({param($sender,$eventArgs) if($eventArgs.Control -and $eventArgs.KeyCode -eq 'S' -and -not $script:Ui.Busy -and $script:Ui.Loaded){switch($script:Ui.Page){'persona'{Save-Persona}'companion'{Save-Companion}'group'{Save-Group}'images'{Save-Images}'models'{Save-ChatModel}};$eventArgs.SuppressKeyPress=$true}})
$timer=New-Object Windows.Forms.Timer;$timer.Interval=250
$timer.Add_Tick({
    try{
        Poll-Jobs
        if(([DateTime]::UtcNow-$script:Ui.LastStatus).TotalSeconds -gt 7){$script:Ui.LastStatus=[DateTime]::UtcNow;Begin-Job 'Status' $null $true}
        if($script:Ui.Page -eq 'images' -and ([DateTime]::UtcNow-$script:Ui.LastImages).TotalSeconds -gt 7){$script:Ui.LastImages=[DateTime]::UtcNow;Begin-Job 'ImageTasks' $null $true}
        if($script:Ui.Page -eq 'models' -and ([DateTime]::UtcNow-$script:Ui.LastModels).TotalSeconds -gt 7){$script:Ui.LastModels=[DateTime]::UtcNow;Begin-Job 'Snapshot' $null $true}
        if($script:Ui.Page -eq 'logs' -and $script:Ui.AutoLogs.Checked -and ([DateTime]::UtcNow-$script:Ui.LastLogs).TotalSeconds -gt 10){$script:Ui.LastLogs=[DateTime]::UtcNow;Begin-Job 'Logs' @{channel=$script:Ui.LogChannels[$script:Ui.LogChoice.SelectedIndex]} $true}
    }catch{Notify '后台刷新暂未完成，可以稍后手动刷新。' 'warning'}
})
$form.Add_Shown({Show-Page 'home';Refresh-Enabled;Begin-Job 'Snapshot' $null $true;Begin-Job 'Status' $null $true;$script:Ui.LastStatus=[DateTime]::UtcNow;$timer.Start()})
$form.Add_FormClosing({param($sender,$eventArgs) if(@($script:Ui.Dirty.Values|Where-Object {$_}).Count -gt 0){if([Windows.Forms.MessageBox]::Show('还有未保存的修改，仍然关闭控制台吗？','未保存的修改','YesNo','Question') -ne 'Yes'){$eventArgs.Cancel=$true}}})
try{[void]$form.ShowDialog()}finally{$timer.Stop();$timer.Dispose();$ConsoleMutex.ReleaseMutex();$ConsoleMutex.Dispose()}
