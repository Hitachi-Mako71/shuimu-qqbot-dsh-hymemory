# Windows 从零部署

先按[两种 QQ 接入方案](QQ_TRANSPORTS.md)选择腾讯官方 QQ Bot 或个人 QQ + NapCat/OneBot 11。两种模式共用本文件的基础安装步骤，传输方式在 `data/transport/onebot.json` 中选择。

## 环境准备

- Windows 11，PowerShell 5.1 或更新版本。
- Git、Node.js 24、Python 3.12 x64、pnpm 11.25。
- 已登录 DeepSeek 的 DSH Harness Home；项目默认使用 `D:\DeepSeekHarnessData\home`。
- 可访问 npm、PyPI、腾讯开放平台和 DeepSeek 服务的网络。
- 官方 QQ Bot 模式需要已配置的腾讯 Bot 应用；OneBot 模式需要个人 QQ、QQ 客户端及 NapCat Shell。

## 获取源码和安装公共依赖

```powershell
New-Item -ItemType Directory -Force D:\DeepSeekHarnessData | Out-Null
git clone https://github.com/Hitachi-Mako71/shuimu-qqbot-dsh-hymemory.git D:\DeepSeekHarnessData\qqbot-hymemory
Set-Location D:\DeepSeekHarnessData\qqbot-hymemory
$env:DSH_HOME='D:\DeepSeekHarnessData\home'
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe tools\materialize-dependency-locks.py --part runtime --project . --dsh-home $env:DSH_HOME
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-qqbot.ps1 -DshHome $env:DSH_HOME
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-hindsight.ps1
```

脚本安装锁定的 DSH、Tencent QQ 插件、配套业务插件、Python 依赖和 Hindsight。随后在同一个 Harness Home 登录 DeepSeek。不要把本机的 `.env`、`qq.credentials.json`、`data` 或 `runtime/napcat` 从其他电脑复制进 Git。

## 填写 QQ 应用凭证

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\configure-qq-local.ps1
```

在本机窗口填写并验证 AppID/AppSecret。两种模式都保留 DSH QQ 插件的应用配置；OneBot 模式实际的个人 QQ 消息收发走本机 OneBot 连接。

## 选择收发方式

按 [QQ_TRANSPORTS.md](QQ_TRANSPORTS.md) 完成其中一种模式的配置：

1. **腾讯官方 QQ Bot**：不配置 OneBot JSON，或将它的 `mode` 设为 `official`。
2. **个人 QQ + NapCat/OneBot**：安装本机 NapCat Shell，并创建只保存在本机的 `data/transport/onebot.json`，将 `mode` 设为 `onebot`。

## 启动和状态核对

```powershell
.\start-all.ps1
Invoke-RestMethod http://127.0.0.1:8765/health
Get-Content .\logs\qqbot.out.log -Tail 30
```

停止服务：

```powershell
.\stop-all.ps1
```

进程启动和本地健康接口不代表 QQ 平台已经完成真人收发验收。首次部署者应在选定的 QQ 模式下自行确认登录、群权限及媒体收发。安装和数据恢复说明见[备份与恢复](BACKUP_AND_RECOVERY.md)。

