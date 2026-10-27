# 柚柚 QQ Bot · DSH · Hindsight

当前公开源码对应本机部署的 **V3.5.0 / QQ 插件 0.22.6**。项目共用 DeepSeek 对话、Hindsight 记忆和 DSH 工具链，并支持两种互斥的 QQ 收发方式：腾讯官方 QQ Bot，或个人 QQ + NapCat/OneBot 11。

> QQBot 接入仍保留在仓库中。官方 Bot 方案适用于腾讯开放平台机器人；OneBot 方案适用于本机登录的个人 QQ。两者使用相同的业务插件和记忆服务，每次只启用一种传输方式。

## 部署入口

- [两种 QQ 接入方案与完整部署步骤](docs/QQ_TRANSPORTS.md)
- [Windows 从零部署](docs/FROM_ZERO.md)
- [配置、数据和隐私边界](docs/CONFIGURATION.md)
- [系统架构](docs/ARCHITECTURE.md)

## 功能

- DeepSeek 对话和 Hindsight 长期记忆；Hindsight 与本地 embedding 按需启动，空闲 5 分钟后释放。
- 私聊、群聊、群友模式、图片识别、用户明确请求的 Codex 内置生图。
- 群/私聊身份隔离、授权群映射、证据来源与删除生命周期。
- 官方 QQ Bot 模式保留原 Tencent DSH QQ 插件、应用凭证和平台权限。
- OneBot 模式复用 DSH 会话与中间件，由本机 NapCat/OneBot 11 处理个人 QQ 收发。

## Windows 管理

```powershell
Set-Location D:\DeepSeekHarnessData\qqbot-hymemory
.\start-all.ps1
.\stop-all.ps1
```

真实凭证、OneBot 映射、QQ 登录态、群设置、聊天、记忆和运行日志只保存在本机。NapCat 与 QQ 客户端二进制不上传到本仓库。

