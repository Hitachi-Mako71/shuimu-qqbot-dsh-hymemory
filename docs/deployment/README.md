# 部署导航

先完成[Windows 基础安装](windows.md)，再选择一种 QQ 传输方式。两种方案使用同一份 `app/` 工程和 `qqbot` profile。

| 方案 | 消息收发 | 账号准备 | 配置入口 |
|---|---|---|---|
| [腾讯官方 QQBot](official-qqbot.md) | Tencent QQ Bot SDK | 腾讯开放平台 Bot，AppID / AppSecret | 默认模式，或 `mode: official` |
| [NapCat / OneBot 11](onebot-napcat.md) | 本机个人 QQ 与 Forward WebSocket | 个人 QQ、NapCat、QQ 客户端；当前启动器仍要求本机应用凭证配置 | `data/transport/onebot.json`，`mode: onebot` |

1. [安装依赖与 DeepSeek 登录](windows.md)
2. [配置官方 QQBot](official-qqbot.md)或[配置 OneBot](onebot-napcat.md)
3. 按所选方案启动，在本机确认登录与 QQ 收发
4. 需要时配置[群聊](../usage/groups.md)、[生图](../usage/images.md)与[控制台](../usage/console.md)

后续维护：[配置说明](configuration.md) · [备份与恢复](backup-and-recovery.md) · [已有部署升级](upgrading.md)。
