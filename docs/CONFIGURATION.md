# 配置说明

## QQ 传输方式

仓库支持两个互斥模式，部署步骤见 [QQ_TRANSPORTS.md](QQ_TRANSPORTS.md)：

- `official`：腾讯官方 QQ Bot 插件直接连接腾讯平台。
- `onebot`：本机 NapCat Shell 提供 OneBot 11 WebSocket，插件以个人 QQ 收发。

模式选择文件为本机 `data/transport/onebot.json`。该文件含 QQ/群映射和 OneBot 令牌，不能提交 Git。缺少该文件时按官方模式启动；`mode: "official"` 也会显式选择官方模式。只有 `mode: "onebot"` 才会启动本项目下的 NapCat 进程。

## 本机目录

| 路径 | 内容 |
|---|---|
| `D:\DeepSeekHarnessData\qqbot-hymemory` | 源码和本机数据根目录 |
| `D:\DeepSeekHarnessData\home` | DSH 运行时、QQ profile、DeepSeek 登录 |
| `data/transport/onebot.json` | OneBot 个人账号、群映射、令牌；仅本机 |
| `data/companion` | 群设置、群控制者及本地状态 |
| `data/evidence` | 真实聊天原文和派生证据 |
| `data/workspaces` | 按 QQ 身份隔离的工作目录与附件 |
| `data/model-routing.json` | 当前主聊天模型路由 |
| `.env` | 本机随机服务令牌和环境设置 |
| `qq.credentials.json` | 本机 QQ 应用凭证 |
| `runtime/napcat` | 本机 NapCat 程序；不进仓库 |

所有 `data`、本机令牌、登录态、聊天、记忆、附件和日志均属于私有运行数据。配置备份不包含这些内容，数据备份应按 [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) 单独管理。

## 记忆和本机接口

默认聊天模型由 DSH 的 DeepSeek 登录提供。Hindsight 1.1.0 和本地 CPU embedding 按需启动；召回、提炼或删除操作需要时启动，所有工作空闲 5 分钟后释放。记忆 API 只监听 loopback 并要求本机 bearer token。端口和依赖见 `.env.example`、`versions.json`。

记忆分区由可信 QQ 网关身份在服务端计算。OneBot 模式的 `users` 和 `groups` 将数字 QQ 号映射到稳定逻辑身份；迁移旧数据时必须复用原逻辑 ID，不能凭昵称猜测或跨群/私聊合并。新用户身份使用独立 ID。

## 更新版本

插件版本以 `dsh-hymemory-plugin/package.json` 和 `versions.json` 为准。修改插件源码后递增插件版本，重新生成 `packages/dsh-hymemory-qq-<version>.tgz`，更新 `dependency-locks/qqbot-profile` 并按 [RELEASE_WORKFLOW.md](RELEASE_WORKFLOW.md) 检查安装副本。不要提交真实凭证或运行目录。

