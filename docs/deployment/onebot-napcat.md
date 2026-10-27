# 部署个人 QQ + NapCat / OneBot 11

本方案使用本机 QQ 客户端和 NapCat Shell，通过 OneBot 11 Forward WebSocket 收发个人 QQ 消息；对话、记忆和群控制继续使用同一份 DSH 业务插件。

## 准备

1. 完成 [Windows 基础安装](windows.md)，包括当前启动器需要的本机 AppID / AppSecret 配置。
2. 准备要登录的个人 QQ。这个账号与应用 AppID 是两个不同的配置项。
3. 从 [NapCatQQ 官方发布页](https://github.com/NapNeko/NapCatQQ/releases)获取匹配的 Shell 版本。当前部署的 QQ / NapCat 版本记录在 [`versions.json`](../../app/versions.json)。

## 放置 NapCat 并开启本机 WebSocket

将 NapCat 解压到 `app/runtime/napcat/` 的子目录，例如：

```text
app/runtime/napcat/NapCatQQ/
  NapCatWinBootMain.exe
  NapCatWinBootHook.dll
  loadNapCat.js
  napcat.mjs
  qqnt.json
```

在 NapCat 中开启 Forward WebSocket Server，监听 `127.0.0.1`，配置独立令牌和端口，例如 3001。机器人进程主动连接这个 WebSocket；不要将它配置成由 NapCat 反向连接机器人。

## 填写私有映射

从 `app/` 创建配置目录并复制模板：

```powershell
New-Item -ItemType Directory -Force .\data\transport | Out-Null
if (Test-Path .\data\transport\onebot.json) { throw '已有配置，请先备份并编辑现有文件。' }
Copy-Item .\examples\onebot.json.example .\data\transport\onebot.json
```

只在首次配置且目标文件不存在时复制；已有配置请先备份。按实际环境填写[模板](../../app/examples/onebot.json.example)：

| 字段 | 内容 |
|---|---|
| `mode` | `onebot` |
| `legacyAppId` | 与本机 DSH QQ profile 的 `QQBOT_APPID` 完全一致 |
| `selfId` | 登录的个人 QQ 数字账号，使用字符串 |
| `url` | NapCat Forward WebSocket 地址，如 `ws://127.0.0.1:3001` |
| `token` | 与 NapCat 配置一致的 64 位小写十六进制随机令牌 |
| `napcatRoot` | NapCat 子目录的绝对路径，必须位于本项目 `app/runtime/napcat/` 内 |
| `qqExecutable` | 本机 QQ 客户端可执行文件的绝对路径 |
| `allowedGroups` | 明确允许的数字群号列表 |
| `groups` | 数字群号到稳定逻辑群 ID 的映射 |
| `users` | 可选的数字 QQ 号到旧逻辑用户 ID 的映射 |
| `mediaRoots` | 允许读取的 QQ / NapCat 媒体缓存目录；不需要时留空 |

`groups` 必须覆盖 `allowedGroups` 中的每个群。新群可使用 `ob-group-<群号>` 作为稳定逻辑 ID；未知用户会得到 `ob-user-<QQ号>`。迁移已有记忆时，必须复用原有逻辑用户/群 ID，不能按昵称猜测对应关系。

`legacyAppId` 和 AppSecret 仍由当前 DSH QQ 启动器的应用配置检查使用；实际个人 QQ 消息收发经 OneBot 完成。模板占位符都需要替换，QQ 登录态、真实映射和令牌只保存在本机。

## 启动

```powershell
.\start-all.ps1
Get-Content .\logs\napcat.out.log -Tail 30
Get-Content .\logs\qqbot.out.log -Tail 30
```

首次登录在本机 QQ / NapCat 界面完成。连接后插件以 `get_login_info` 核对实际账号，必须与 `selfId` 相同；连接状态写入本机 `data/transport/status.json`。

只处理 `allowedGroups` 中的群。绑定群参与模式见[群聊指南](../usage/groups.md)。本机 WebSocket 和 WebUI 保持 loopback 监听。

停止使用 `.\stop-all.ps1`，它会按本项目保存的进程记录停止 QQ / DSH、记忆及 NapCat。切换回[官方 QQBot](official-qqbot.md)时，先停止服务，再修改 transport 模式并重新启动。
