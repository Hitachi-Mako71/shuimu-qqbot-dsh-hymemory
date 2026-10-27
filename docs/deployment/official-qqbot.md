# 部署腾讯官方 QQBot

本方案通过腾讯开放平台 Bot 与 Tencent QQ Bot SDK 收发消息，保留项目原有的官方 QQBot 接入。

## 准备

1. 完成 [Windows 基础安装](windows.md)。
2. 在腾讯开放平台准备 Bot 应用、AppID / AppSecret，并配置发布范围、测试成员与群权限。
3. 在 `app/` 运行 `configure-qq-local.ps1`，在本机验证并保存应用凭证。

## 选择官方模式

新安装没有 `data/transport/onebot.json` 时默认使用官方 QQBot。如果已有 OneBot 配置，先停止服务并备份私有配置，再将其中 `mode` 改为 `official`；启动器会跳过 NapCat。

显式官方模式的最小配置为：

```json
{
  "mode": "official"
}
```

## 启动

```powershell
Set-Location <仓库路径>\app
.\start-all.ps1
Get-Content .\logs\qqbot.out.log -Tail 30
```

日志应出现 `Bot ready!`。随后由部署者在已授权的私聊与群中确认收发。需要接收普通群消息时，还需在 QQ 平台/客户端侧开启相应权限，再按[群聊指南](../usage/groups.md)绑定本群。

停止使用 `.\stop-all.ps1`。切换为个人 QQ 时先停止，再按 [NapCat / OneBot](onebot-napcat.md) 配置，不要同时运行两份接入进程。

相关文件：[`install-qqbot.ps1`](../../app/install-qqbot.ps1)、[`dsh-qqbot.patch.yml`](../../app/dsh-qqbot.patch.yml)、[固定 QQ 插件补丁](../../app/patches/)。
