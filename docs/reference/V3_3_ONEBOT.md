> 分版本技术记录：当前安装与运行入口见[部署导航](../deployment/README.md)，命令默认从 `app/` 执行。

# OneBot 11 个人 QQ 传输

本项目的个人 QQ 模式使用本机 QQ 客户端、NapCat Shell 和 OneBot 11 Forward WebSocket。它与腾讯官方 QQ Bot 模式共用 DSH profile、身份/记忆业务插件和 Hindsight；选择方法和完整部署步骤见 [QQ_TRANSPORTS.md](../deployment/README.md)。

关键边界：

- OneBot WebSocket 使用 loopback 和独立随机令牌；QQ 登录身份必须与 `selfId` 完全相同。
- `allowedGroups` 明确限制收取的群；`users`/`groups` 映射用于稳定身份和记忆分区，迁移时复用旧逻辑 ID。
- 私有映射、令牌、QQ 登录态、NapCat 二进制和媒体缓存不提交仓库。
- 未确认发送状态不自动重放；未适配的官方 Bot 专用 API 在 OneBot 模式明确失败。
- 停止服务只针对本项目记录的 NapCat/QQ/DSH 进程。

