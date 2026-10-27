# Windows 基础安装

本页完成两种 QQ 方案共用的环境、依赖和账号准备。所有安装命令都从 `app/` 执行。

## 环境

- Windows，PowerShell 5.1 或更新版本、Git。
- Node.js 24、Python 3.12 x64、pnpm 11.25；固定组件见 [`versions.json`](../../app/versions.json)。
- 同一个 DSH Harness Home 中的 DeepSeek 登录，默认 Home 为 `D:\DeepSeekHarnessData\home`。
- 能访问 npm、PyPI、模型下载源及所选 QQ 接入服务的网络。

## 获取与安装

目标目录已有运行数据时，先阅读[升级说明](upgrading.md)，不要覆盖克隆。

```powershell
New-Item -ItemType Directory -Force D:\DeepSeekHarnessData | Out-Null
git clone https://github.com/Hitachi-Mako71/shuimu-qqbot-dsh-hymemory.git D:\DeepSeekHarnessData\qqbot-hymemory
Set-Location D:\DeepSeekHarnessData\qqbot-hymemory\app
$env:DSH_HOME='D:\DeepSeekHarnessData\home'
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe tools\materialize-dependency-locks.py --part runtime --project . --dsh-home $env:DSH_HOME
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-qqbot.ps1 -DshHome $env:DSH_HOME
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-hindsight.ps1
```

安装器只配置专用 `qqbot` profile。Tencent QQ 插件仍是两种传输方式共同使用的 DSH QQ 接入层；OneBot 模式通过项目适配器替换实际消息收发。

在同一个 Harness Home 完成 DeepSeek 登录。`DSH_HOME` 设置在进程环境中，不写入 `.env`。更换 Home 后，启动终端和桌面入口也需要使用相同值。

## QQ 应用配置

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\configure-qq-local.ps1
```

在本机窗口填写并验证 AppID / AppSecret。当前启动器会检查这两个配置；OneBot 模式还需要自己的个人 QQ 登录与本机 WebSocket 配置。

接着选择[官方 QQBot](official-qqbot.md)或[NapCat / OneBot](onebot-napcat.md)，按对应页面启动。

## 查看服务状态

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health
Get-Content .\logs\qqbot.out.log -Tail 30
```

本地健康接口说明服务可访问；QQ 登录、群权限及实际收发需要在所选方案中分别确认。Hindsight 按需加载，健康接口在线时引擎可能处于空闲释放状态，见[资源使用说明](../usage/performance.md)。
