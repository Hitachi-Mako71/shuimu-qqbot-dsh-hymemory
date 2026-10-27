# Windows 控制台

控制台由 `app/robot-control.ps1` 提供，当前组件版本见 [`versions.json`](../../app/versions.json)。

```powershell
Set-Location <仓库路径>\app
.\robot-control.ps1
```

界面可管理服务启停、DeepSeek 状态、主动消息、群聊设置、人设与回复、生图任务、日志及备份导出。关闭窗口后，服务保持原来的启停状态。

账号登录、OneBot 私有映射和真实数据在本机保管。日志读取和配置展示会遮蔽凭证；配置备份与记忆导出是不同用途，见[备份与恢复](../deployment/backup-and-recovery.md)。

控制台快捷方式可由应用目录的 `create-control-shortcut.ps1` 创建。已有部署的快捷方式继续指向原部署目录，目录调整见[升级说明](../deployment/upgrading.md)。
